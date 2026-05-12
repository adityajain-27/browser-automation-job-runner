# Architecture Reasoning

This document explains the engineering decisions behind the Browser Automation Job Runner. Each section covers a specific design choice, the alternatives considered, and why this approach was selected.

---

## 1. Job State Model

The system uses four states: **queued**, **running**, **completed**, **failed**.

This is the minimum viable state machine for an async job system. `queued` exists because we cap concurrent browser sessions — a job that can't run immediately needs a state that distinguishes it from one that's actively executing. Without `queued`, you'd either have to reject excess jobs (bad UX) or pretend they're running when they're not (confusing).

`running` means a Playwright browser is actively allocated to this job. This is important because browsers are the scarce resource — knowing how many jobs are in `running` state tells you your current resource usage at a glance.

`completed` and `failed` are terminal states. A job never leaves them. This immutability is deliberate: it means you can cache terminal job responses aggressively and never worry about stale data.

Why not more states? You could add `cancelled` or `retrying`, but neither is needed for this system. Cancellation would require the ability to kill a running Playwright session mid-flight, which adds complexity without clear user value in a system where jobs take seconds. Retrying is better handled by letting the user submit a new job — it's simpler and avoids the question of how many retries are enough.

Why not fewer? Collapsing `queued` and `running` into a single state would lose the ability to tell users "your job is waiting for a browser slot." That's important feedback.

---

## 2. Concurrency Model

The system uses `asyncio.Semaphore(3)` to limit concurrent browser sessions.

**Why a semaphore instead of a task queue like Celery or RQ?** Because the entire system runs in a single asyncio event loop. Playwright's async API is designed for this — it manages browser processes internally and communicates over CDP (Chrome DevTools Protocol). Adding an external task queue would mean:

1. A separate worker process that needs its own Playwright installation
2. A message broker (Redis/RabbitMQ) — another service to deploy and monitor
3. Serialization of the `emit` callback, which is fundamentally not serializable because it holds a reference to live WebSocket connections

The semaphore approach keeps everything in-process. The `emit` callback is a closure that captures both the database connection and the WebSocket subscriber list. This is only possible because everything lives in the same event loop.

**Why cap at 3?** Each headless Chromium instance consumes roughly 100-200MB of RAM. On a typical 1GB container, 3 concurrent browsers plus the Python process and OS overhead leaves a reasonable buffer. The number is configurable by changing `MAX_CONCURRENT_JOBS`, but 3 is a safe default that prevents OOM kills without being so conservative that it feels slow.

**What happens to queued jobs?** When a job calls `async with _semaphore`, it blocks (yields control) until a slot opens. The `asyncio.create_task()` call in the route handler means the job's coroutine is already scheduled — it's just awaiting the semaphore. When a running job finishes and releases the semaphore, the next waiting coroutine immediately acquires it and transitions from `queued` to `running`. There's no explicit queue data structure needed because asyncio's internal task scheduling handles the FIFO ordering of semaphore waiters.

---

## 3. WebSocket vs Polling

WebSocket was chosen for the real-time event stream. Here's what would break with polling:

**Latency.** A browser automation produces 7 events over roughly 3-5 seconds. With polling at 1-second intervals, you'd miss the temporal relationship between events — they'd arrive in batches rather than individually. The UI's "live log" effect depends on events arriving one at a time as they actually happen.

**Unnecessary load.** Polling means the client hammers the server even when nothing has changed. For a system designed to show a live feed of discrete events, this is wasteful. You'd need to track "last seen event index" on the client and add a `/jobs/{id}/events?since=N` endpoint — more code on both sides for a worse experience.

**Connection overhead.** Each poll is a full HTTP request/response cycle. WebSocket upgrades once and then sends lightweight frames. For 7 events, that's 1 connection vs 7+ HTTP round trips.

**Server-initiated close.** When the job finishes, the server closes the WebSocket cleanly. With polling, the client has to figure out on its own that the job is done — likely by checking the `status` field in each response. This is doable but adds a class of bugs around race conditions (what if the status changes between the last event and the status check?).

The one genuine downside of WebSocket is reconnection handling. If the connection drops mid-job, the client needs to reconnect and replay missed events. The system handles this by storing all events in the database — when a client connects to a job that's already in progress, it receives all stored logs first, then gets live events going forward.

---

## 4. Process Safety

The entire Playwright automation is wrapped in `try/finally`:

```python
try:
    async with async_playwright() as p:
        browser = await p.chromium.launch(...)
        # ... all automation steps ...
except Exception:
    await emit("job.failed", {...})
    raise
finally:
    if browser is not None:
        await browser.close()
```

**What this guarantees:** The browser process is closed regardless of what happens — normal completion, an exception in any step, a timeout, or even a KeyboardInterrupt. The `finally` block runs unconditionally.

**Failure modes it handles:**

- **Network errors:** If the target URL is unreachable or times out, `page.goto()` raises. The `except` block emits a `job.failed` event with the error, then `finally` closes the browser.
- **Selector failures:** If the page structure changes and `query_selector_all` returns nothing, the code still runs — it just extracts zero books. If a selector throws (e.g., trying to get an attribute on None), the error propagates to `except`.
- **Resource exhaustion:** If the system runs out of memory mid-scrape, the finally block still attempts cleanup. In practice, Python might not get there in a true OOM, but for most memory pressure scenarios it works.
- **Playwright crashes:** If Chromium itself crashes, `browser.close()` will raise but won't re-raise because it's in `finally`. The browser process is already dead, so there's nothing to leak.

**Why not `async with` for the browser?** Playwright's browser object isn't an async context manager. `async_playwright()` is, and it manages the Playwright server process — but individual browsers need explicit `.close()` calls. Hence the manual `try/finally`.

---

## 5. Log Storage

Events are stored as a JSONB array on the job row: `logs JSONB DEFAULT '[]'::jsonb`.

**Why JSONB instead of a separate `events` table?** Because the events are always read and written as a unit. You never query "give me all `page.loaded` events across all jobs" — you query "give me all events for job X." A separate table would mean a JOIN on every job fetch and an INSERT for every event. With JSONB, appending is a single `UPDATE ... SET logs = logs || $1::jsonb`, and reading is just part of the row fetch.

**Tradeoffs:**

- **Pro: Simplicity.** One table, no JOINs, no foreign keys. The event log is denormalized onto the job row, which matches the access pattern perfectly.
- **Pro: Atomicity.** Each event append is a single UPDATE. There's no risk of orphaned events if a job row gets deleted.
- **Con: Append performance.** Each `logs || new_event` rewrites the entire JSONB value. For 7 events this is negligible. For hundreds of events per job, you'd want a separate table. But this system produces exactly 7 events (or fewer on failure), so the rewrite cost is irrelevant.
- **Con: No per-event indexing.** You can't efficiently query "find all jobs where the data.extracted event shows count > 50." If that were a requirement, a separate table with indexed columns would be better. It's not a requirement here.

The JSONB type (as opposed to JSON) is used because it stores data in a decomposed binary format, which is faster to process and supports indexing via GIN if needed later.

---

## 6. Frontend Architecture

The UI is a state machine with four phases: **IDLE → RUNNING → COMPLETED | FAILED**.

**Why a state machine?** Because the UI has exactly four distinct visual states, and any given moment should show exactly one of them. A state machine makes impossible states impossible — you can't simultaneously show the input form and the results table. Each phase maps to a specific set of components:

| Phase | Components Shown |
|---|---|
| IDLE | JobForm |
| RUNNING | LiveLog (streaming) |
| COMPLETED | LiveLog (frozen) + ResultPanel |
| FAILED | ErrorPanel (with LiveLog embedded) |

This is simpler than managing multiple boolean flags (`isLoading`, `hasError`, `showResults`, etc.) which can desync. With a state machine, there's one source of truth.

**How reconnection works:** If the WebSocket drops during a `RUNNING` phase, the `useJobSocket` hook detects the `onclose` event. The phase stays `RUNNING` but `isConnected` becomes false. The user sees the events that already arrived. Since events are persisted to the database, a reconnection (by re-rendering the hook with the same `jobId`) replays stored events and resumes live streaming.

In practice, the automation takes 3-5 seconds. A dropped WebSocket during that window is rare, and the worst case is the user sees a stale "Running..." indicator that doesn't update. The "completed" or "failed" state is always retrievable via `GET /jobs/{id}` after the fact.

**No page reloads.** The entire flow — form submission, event streaming, result display, reset — happens through React state updates. The URL never changes. This is deliberate: the system is a single-purpose tool, not a multi-page app. There's nothing to route to.

# Browser Automation Job Runner

A full-stack application that accepts a target URL, launches a headless browser to automate tasks against it, and streams every step back to the user in real time via WebSockets.

Built with FastAPI, Playwright, PostgreSQL, and Next.js.

---

## Quick Start

Make sure Docker and Docker Compose are installed, then run:

```bash
docker compose up --build
```

This spins up three containers:

| Service    | Port  | Description                        |
|------------|-------|------------------------------------|
| `frontend` | 3000  | Next.js UI                         |
| `backend`  | 8000  | FastAPI server + Playwright        |
| `postgres` | 5432  | PostgreSQL 15 with JSONB logs      |

Open [http://localhost:3000](http://localhost:3000), enter a URL and goal, and hit **Run Automation**.

The default target is `https://books.toscrape.com` — the automation extracts all book titles, prices, ratings, and availability from the page.

---

## How It Works

```
User clicks "Run Automation"
        │
        ▼
  POST /jobs  ──►  Job created in DB (status: queued)
        │
        ▼
  Background task starts, acquires semaphore slot
        │
        ▼
  Playwright launches headless Chromium
        │
        ├── browser.launched    ──►  WebSocket event
        ├── page.navigating     ──►  WebSocket event
        ├── page.loaded         ──►  WebSocket event
        ├── action.taken        ──►  WebSocket event (scroll)
        ├── screenshot.captured ──►  WebSocket event
        ├── data.extracted      ──►  WebSocket event
        └── job.completed       ──►  WebSocket event
        │
        ▼
  Browser closed, results saved to DB
  Frontend fetches and displays the extracted data table
```

Each event is persisted to the database as JSONB and simultaneously broadcast to the connected WebSocket client. If a client connects after the job finishes, it replays all stored events.

---

## Architecture

### Backend (Python)

- **FastAPI** handles REST endpoints (`POST /jobs`, `GET /jobs`, `GET /jobs/{id}`) and the WebSocket endpoint (`/ws/{job_id}`)
- **asyncpg** provides async PostgreSQL access with a connection pool
- **Playwright** runs headless Chromium for page navigation, screenshotting, and data extraction
- **asyncio.Semaphore(3)** limits concurrent browser sessions to prevent memory exhaustion — each Chromium instance uses ~150MB RAM

### Frontend (Next.js + TypeScript)

- State machine with four phases: `IDLE → RUNNING → COMPLETED | FAILED`
- `useJobSocket` custom hook manages WebSocket connection lifecycle
- Components: `JobForm`, `LiveLog`, `ResultPanel`, `ErrorPanel`
- Each phase renders a different set of components — impossible states are impossible

### Database (PostgreSQL 15)

Single `jobs` table with JSONB columns for `result` (extracted data) and `logs` (event stream). Events are appended with `logs || new_event::jsonb`. See `docs/schema.sql` for the full definition.

---

## Job State Machine

```
queued ──► running ──► completed
                  └──► failed
```

- **queued** — job is waiting for a semaphore slot (max 3 concurrent)
- **running** — Playwright browser is actively allocated
- **completed** — extraction finished, results stored
- **failed** — an error occurred, error message stored

Terminal states are immutable. A job never transitions backwards.

---

## Project Structure

```
├── backend/
│   ├── main.py            FastAPI app, routes, WebSocket handler
│   ├── job_runner.py       Semaphore-based concurrency + event broadcasting
│   ├── automation.py       Playwright scraping logic
│   ├── database.py         asyncpg connection pool + query helpers
│   ├── schemas.py          Pydantic request/response models
│   ├── models.py           Dataclass reference for the jobs table
│   ├── requirements.txt    Python dependencies
│   └── Dockerfile
│
├── frontend/
│   ├── app/
│   │   ├── page.tsx        Main page with state machine
│   │   ├── layout.tsx      Root layout
│   │   └── globals.css     Base styles
│   ├── components/
│   │   ├── JobForm.tsx     URL + goal input form
│   │   ├── LiveLog.tsx     Real-time event stream display
│   │   ├── ResultPanel.tsx Extracted data table + screenshot
│   │   └── ErrorPanel.tsx  Error display with failure context
│   ├── hooks/
│   │   └── useJobSocket.ts WebSocket connection hook
│   ├── types/
│   │   └── job.ts          TypeScript interfaces
│   └── Dockerfile
│
├── docs/
│   ├── schema.sql          PostgreSQL table definition
│   └── reasoning.md        Architecture decisions and tradeoffs
│
└── docker-compose.yml      Three-service orchestration
```

---

## API Reference

### `POST /jobs`

Create a new automation job.

```json
{
  "url": "https://books.toscrape.com",
  "goal": "Extract all book titles and prices"
}
```

Response: `{ "job_id": "uuid", "status": "queued" }`

### `GET /jobs/{job_id}`

Fetch full job record including result, logs, and error.

### `GET /jobs`

List the 20 most recent jobs.

### `WebSocket /ws/{job_id}`

Connect to receive real-time events for a job. Events arrive as JSON:

```json
{
  "event": "page.loaded",
  "timestamp": "2026-05-12T10:15:30.123Z",
  "data": { "url": "https://books.toscrape.com/", "title": "All products | Books to Scrape" }
}
```

Terminal events (`job.completed`, `job.failed`) close the connection.

---

## Process Safety

The Playwright automation is wrapped in `try/finally` to guarantee browser cleanup:

- Network timeouts, selector failures, and crashes all trigger the `except` block which emits `job.failed`
- The `finally` block always calls `browser.close()` regardless of outcome
- The semaphore is released automatically via `async with`, even on exceptions

This prevents zombie Chromium processes from leaking memory.

---

## Design Decisions

See [`docs/reasoning.md`](docs/reasoning.md) for detailed explanations of:

- Why 4 states (not more, not fewer)
- Why `asyncio.Semaphore` instead of Celery/RQ
- Why WebSocket instead of polling
- Why JSONB logs on the job row instead of a separate events table
- Why the frontend uses a state machine instead of boolean flags

import asyncio
from datetime import datetime, timezone
from uuid import UUID

from database import (
    update_job_status,
    append_job_log,
    set_job_result,
    set_job_error,
)
from automation import run_automation


MAX_CONCURRENT_JOBS = 3
_semaphore = asyncio.Semaphore(MAX_CONCURRENT_JOBS)

# job_id -> list of asyncio.Queue (one per connected WS client)
_ws_subscribers: dict[str, list[asyncio.Queue]] = {}


def subscribe(job_id: str) -> asyncio.Queue:
    queue: asyncio.Queue = asyncio.Queue()
    if job_id not in _ws_subscribers:
        _ws_subscribers[job_id] = []
    _ws_subscribers[job_id].append(queue)
    return queue


def unsubscribe(job_id: str, queue: asyncio.Queue) -> None:
    if job_id in _ws_subscribers:
        try:
            _ws_subscribers[job_id].remove(queue)
        except ValueError:
            pass
        if not _ws_subscribers[job_id]:
            del _ws_subscribers[job_id]


async def _broadcast(job_id: str, event: dict) -> None:
    if job_id in _ws_subscribers:
        for queue in _ws_subscribers[job_id]:
            await queue.put(event)


async def run_job(job_id: str, url: str, goal: str) -> None:
    job_uuid = UUID(job_id)

    async with _semaphore:
        await update_job_status(job_uuid, "running")

        async def emit(event_name: str, data: dict) -> None:
            event_obj = {
                "event": event_name,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "data": data,
            }
            await append_job_log(job_uuid, event_obj)
            await _broadcast(job_id, event_obj)

        try:
            books = await run_automation(url, goal, job_id, emit)

            await set_job_result(job_uuid, books)
            await update_job_status(job_uuid, "completed")
            await emit("job.completed", {"books_count": len(books)})

        except Exception as exc:
            await set_job_error(job_uuid, str(exc))
            await update_job_status(job_uuid, "failed")
            await emit("job.failed", {"reason": str(exc), "last_step": "automation"})

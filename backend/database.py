import os
import json
import asyncpg
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID


DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/kustodian"
)

_pool: Optional[asyncpg.Pool] = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def create_job(url: str, goal: str) -> dict:
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        INSERT INTO jobs (url, goal, status)
        VALUES ($1, $2, 'queued')
        RETURNING job_id, url, goal, status, created_at, updated_at, result, error, logs
        """,
        url,
        goal,
    )
    return _row_to_dict(row)


async def get_job(job_id: UUID) -> Optional[dict]:
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT job_id, url, goal, status, created_at, updated_at, result, error, logs
        FROM jobs WHERE job_id = $1
        """,
        job_id,
    )
    if row is None:
        return None
    return _row_to_dict(row)


async def list_jobs(limit: int = 20) -> list[dict]:
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT job_id, url, goal, status, created_at, updated_at, result, error, logs
        FROM jobs
        ORDER BY created_at DESC
        LIMIT $1
        """,
        limit,
    )
    return [_row_to_dict(r) for r in rows]


async def update_job_status(job_id: UUID, status: str) -> None:
    pool = await get_pool()
    await pool.execute(
        "UPDATE jobs SET status = $1 WHERE job_id = $2",
        status,
        job_id,
    )


async def append_job_log(job_id: UUID, event: dict) -> None:
    pool = await get_pool()
    await pool.execute(
        """
        UPDATE jobs
        SET logs = COALESCE(logs, '[]'::jsonb) || $1::jsonb
        WHERE job_id = $2
        """,
        json.dumps(event),
        job_id,
    )


async def set_job_result(job_id: UUID, result: list[dict]) -> None:
    pool = await get_pool()
    await pool.execute(
        "UPDATE jobs SET result = $1::jsonb WHERE job_id = $2",
        json.dumps(result),
        job_id,
    )


async def set_job_error(job_id: UUID, error: str) -> None:
    pool = await get_pool()
    await pool.execute(
        "UPDATE jobs SET error = $1 WHERE job_id = $2",
        error,
        job_id,
    )


def _row_to_dict(row: asyncpg.Record) -> dict:
    d = dict(row)
    d["job_id"] = str(d["job_id"])
    for key in ("created_at", "updated_at"):
        if isinstance(d[key], datetime):
            d[key] = d[key].isoformat()

    # asyncpg may return JSONB columns as strings depending on pool config
    for key in ("result", "logs"):
        if d.get(key) and isinstance(d[key], str):
            try:
                d[key] = json.loads(d[key])
            except json.JSONDecodeError:
                pass

    return d

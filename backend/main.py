import asyncio
from uuid import UUID
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import get_pool, close_pool, create_job, get_job, list_jobs
from schemas import JobCreate, JobResponse, JobDetail, JobList
from job_runner import run_job, subscribe, unsubscribe


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_pool()
    yield
    await close_pool()


app = FastAPI(
    title="Browser Automation Job Runner",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/screenshots", StaticFiles(directory="screenshots"), name="screenshots")


@app.post("/jobs", response_model=JobResponse)
async def create_new_job(body: JobCreate):
    job = await create_job(body.url, body.goal)
    job_id = job["job_id"]
    asyncio.create_task(run_job(job_id, body.url, body.goal))
    return JobResponse(job_id=job_id, status="queued")


@app.get("/jobs/{job_id}", response_model=JobDetail)
async def get_job_detail(job_id: UUID):
    job = await get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobDetail(**job)


@app.get("/jobs", response_model=JobList)
async def get_all_jobs():
    jobs = await list_jobs(limit=20)
    return JobList(jobs=[JobDetail(**j) for j in jobs])


@app.websocket("/ws/{job_id}")
async def websocket_endpoint(websocket: WebSocket, job_id: str):
    await websocket.accept()

    try:
        job_uuid = UUID(job_id)
    except ValueError:
        await websocket.close(code=1008, reason="Invalid job ID")
        return

    job = await get_job(job_uuid)
    if job is None:
        await websocket.close(code=1008, reason="Job not found")
        return

    # Job already finished — replay stored logs and close
    if job["status"] in ("completed", "failed"):
        for event in (job.get("logs") or []):
            await websocket.send_json(event)
        await websocket.close(code=1000)
        return

    # Job still active — subscribe to live events
    event_queue = subscribe(job_id)

    try:
        for event in (job.get("logs") or []):
            await websocket.send_json(event)

        while True:
            event = await event_queue.get()
            await websocket.send_json(event)

            if event.get("event") in ("job.completed", "job.failed"):
                await websocket.close(code=1000)
                break

    except WebSocketDisconnect:
        pass
    except Exception:
        try:
            await websocket.close(code=1011)
        except Exception:
            pass
    finally:
        unsubscribe(job_id, event_queue)

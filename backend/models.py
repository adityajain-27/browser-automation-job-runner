from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional
from uuid import UUID


@dataclass
class Job:
    """Schema reference for the jobs table. Not used at runtime (we use raw asyncpg)."""

    job_id: UUID
    url: str
    goal: str
    status: str  # queued | running | completed | failed
    created_at: datetime
    updated_at: datetime
    result: Optional[list[dict]] = None
    error: Optional[str] = None
    logs: list[dict] = field(default_factory=list)

    VALID_STATUSES = ("queued", "running", "completed", "failed")

    TRANSITIONS = {
        "queued": ("running",),
        "running": ("completed", "failed"),
        "completed": (),
        "failed": (),
    }

    def can_transition_to(self, new_status: str) -> bool:
        return new_status in self.TRANSITIONS.get(self.status, ())

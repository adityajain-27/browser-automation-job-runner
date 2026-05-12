from pydantic import BaseModel, Field, field_validator
from typing import Optional
import re


class JobCreate(BaseModel):
    url: str = Field(..., description="Target URL")
    goal: str = Field(..., description="Automation goal")

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("URL must not be empty")
        pattern = re.compile(
            r"^https?://"
            r"(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)++"
            r"[a-zA-Z]{2,}"
            r"(?::\d{1,5})?"
            r"(?:/[^\s]*)?$"
        )
        if not pattern.match(v):
            raise ValueError("URL must be a valid HTTP or HTTPS URL")
        return v

    @field_validator("goal")
    @classmethod
    def validate_goal(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Goal must not be empty")
        return v


class JobResponse(BaseModel):
    job_id: str
    status: str


class BookResult(BaseModel):
    title: str
    price: str
    rating: str
    availability: str


class JobEvent(BaseModel):
    event: str
    timestamp: str
    data: dict


class JobDetail(BaseModel):
    job_id: str
    url: str
    goal: str
    status: str
    result: Optional[list[dict]] = None
    error: Optional[str] = None
    logs: Optional[list[dict]] = None
    created_at: str
    updated_at: str


class JobList(BaseModel):
    jobs: list[JobDetail]

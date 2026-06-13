from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional
from models.models import UserRole, SessionStatus, ParticipantRole, RecordingStatus, MessageType


# ── Auth ───────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    role: UserRole
    created_at: datetime

    class Config:
        from_attributes = True


# ── Sessions ───────────────────────────────────────────────────────────────

class CreateSessionRequest(BaseModel):
    title: str


class SessionOut(BaseModel):
    id: str
    title: str
    invite_token: str
    status: SessionStatus
    created_by: str
    started_at: Optional[datetime]
    ended_at: Optional[datetime]
    duration_seconds: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


class ParticipantOut(BaseModel):
    id: str
    display_name: str
    role: ParticipantRole
    joined_at: datetime
    left_at: Optional[datetime]

    class Config:
        from_attributes = True


class SessionDetailOut(SessionOut):
    participants: list[ParticipantOut] = []


# ── Chat ───────────────────────────────────────────────────────────────────

class ChatMessageOut(BaseModel):
    id: str
    sender_name: str
    sender_role: str
    message: Optional[str]
    file_url: Optional[str]
    file_name: Optional[str]
    message_type: MessageType
    created_at: datetime

    class Config:
        from_attributes = True


# ── Recordings ─────────────────────────────────────────────────────────────

class RecordingOut(BaseModel):
    id: str
    session_id: str
    status: RecordingStatus
    file_path: Optional[str]
    download_url: Optional[str]
    file_size_bytes: Optional[int]
    started_at: datetime
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True


# ── Session Events ─────────────────────────────────────────────────────────

class SessionEventOut(BaseModel):
    id: str
    event_type: str
    actor_name: str
    event_metadata: Optional[dict]
    occurred_at: datetime

    class Config:
        from_attributes = True

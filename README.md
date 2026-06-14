# ActivLaunch — Video Support Platform
### Built for AtomQuest Hackathon 1.0 Grand Finale

A self-hosted real-time video calling platform for customer support teams. Media routes through your own server via mediasoup SFU — no Twilio, Agora, or any third-party video API.

---

## Live Demo

| Service | URL |
|---|---|
| Web App | https://active-launch-frontend.vercel.app/ |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend | FastAPI + python-socketio + Celery |
| Media Server | mediasoup v3 (SFU) + GStreamer |
| Database | Neon DB (PostgreSQL) |
| Redis | Upstash (serverless Redis) |
| File Storage | Supabase Storage |
| Deployment | Render (backend + media) + Vercel (frontend) |

---

## Prerequisites

| Tool | Version |
|---|---|
| Python | 3.11+ |
| Node.js | 18+ |
| FFmpeg | 6+ |
| GStreamer | 1.20+ (with gst-plugins-bad) |

> No local database, Redis, or MinIO needed — all replaced with free cloud services.

---

## Cloud Services Required (all free)

| Service | Purpose | Sign up |
|---|---|---|
| Neon DB | PostgreSQL database | neon.tech |
| Upstash | Redis broker | upstash.com |
| Supabase | File + recording storage | supabase.com |

---

## Local Setup

### 1. Clone the repo
```bash
git clone https://github.com/mm-972927/activeLaunch
cd activlaunch
```

### 2. Create backend `.env`
Create `backend/.env` with the following:

```
DATABASE_URL=postgresql+asyncpg://neondb_owner:YOUR_PASSWORD@ep-xxx.neon.tech/neondb?ssl=require
REDIS_URL=rediss://default:YOUR_TOKEN@your-endpoint.upstash.io:6379
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
MEDIA_SERVER_URL=http://localhost:3001
JWT_SECRET=your-secret-key-here
JWT_EXPIRE_MINUTES=1440
FRONTEND_URL=http://localhost:5173
ENVIRONMENT=development
RECONNECT_GRACE_SECONDS=30
```

### 3. Backend
```bash
cd backend

# Create virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Run database migrations
alembic revision --autogenerate -m "initial"
alembic upgrade head

# Terminal 1 — API server
uvicorn main:socket_app --host 0.0.0.0 --port 8000 --reload

# Terminal 2 — Celery worker (for recording processing)
celery -A tasks.recording_tasks worker --loglevel=info
```

### 4. Media Server
```bash
cd media-server
npm install
node server.js
# Runs on http://localhost:3001
```

### 5. Frontend
```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:5173
```

---

## Test the Platform

1. Open http://localhost:5173
2. Register an agent account → login
3. Click **New Session** → enter a title → **Create**
4. Click **Copy invite** → open that link in a different browser or incognito tab
5. Enter your name as customer → **Join Video Call**
6. Both sides see and hear each other

### Make an Admin Account
After registering, run this in your Neon DB SQL console:
```sql
UPDATE users SET role = 'admin' WHERE email = 'your@email.com';
```

---

## Architecture

```
Browser (Agent)                        Browser (Customer)
      |                                       |
      |------ REST API -------> FastAPI (Python) <------|
      |------ Socket.IO ----->  python-socketio         |
      |                               |                  |
      |       WebRTC Signaling (SDP/ICE exchange)        |
      |                               |                  |
      |--- WebRTC media ----> mediasoup SFU (Node.js) <--|
                                      |
                         GStreamer (recording tap)
                                      |
                          Supabase Storage (files)
                                      |
                         Celery (MP4 conversion)
                                      |
                              Neon DB (metadata)
                              Upstash Redis (broker)
```

---

## Features

| Feature | Description |
|---|---|
| Video Calling | Server-routed via mediasoup SFU — never peer-to-peer |
| In-Call Chat | Real-time messages persisted per session |
| File Sharing | Upload images/PDFs during a call |
| Call Recording | Agent starts/stops; converted to MP4 and downloadable |
| Reconnect Handling | 30s grace window — rejoin without disruption |
| Admin Dashboard | Live sessions, full history, force-end any session |
| Observability | Prometheus metrics at `/metrics` + Grafana dashboard |

---

## Roles

| Role | Access |
|---|---|
| Agent | Create sessions, end calls, start/stop recording |
| Customer | Join via invite link only — no login required |
| Admin | All agent actions + force-end any session + admin dashboard |

---

## API Documentation

Available at http://localhost:8000/docs when running locally.

---

## Deployment

| Service | Platform |
|---|---|
| Frontend | Vercel — set `VITE_API_URL` to backend URL |
| Backend | Render — root dir: `backend`, start: `uvicorn main:socket_app --host 0.0.0.0 --port $PORT` |
| Media Server | Render — root dir: `media-server`, start: `node server.js` |

---

## Observability

- Prometheus metrics: http://localhost:8000/metrics
- Grafana dashboard: import `observability/grafana/dashboard.json`
- Key metrics: active sessions, connected participants, message rate, recording count, API latency

---

## Known Limitations

- GStreamer recording requires `gst-plugins-bad` installed locally
- Celery recording tasks require FFmpeg installed on the server
- Render free tier spins down after inactivity — first request may be slow

---

*Built for AtomQuest Hackathon 1.0 Grand Finale by Team ActivLaunch*

# AtomQuest Hackathon 1.0 — Video Support Platform

A self-hosted real-time video calling platform for customer support teams.

## Prerequisites

Install these locally (no Docker):

| Tool | Version | Install |
|---|---|---|
| Python | 3.11+ | python.org |
| Node.js | 18+ | nodejs.org |
| PostgreSQL | 15 | postgresql.org |
| Redis | 7 | redis.io |
| MinIO | latest | min.io/download |
| FFmpeg | 6+ | ffmpeg.org |
| GStreamer | 1.20+ | gstreamer.freedesktop.org |

## Setup

### 1. Clone & navigate
```bash
git clone <your-repo>
cd atomquest-video-platform
```

### 2. PostgreSQL
```bash
psql -U postgres -c "CREATE DATABASE atomquest;"
psql -U postgres -c "CREATE USER atomuser WITH PASSWORD 'yourpassword';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE atomquest TO atomuser;"
```

### 3. Redis
```bash
# Ubuntu
sudo apt install redis-server && sudo systemctl start redis

# macOS
brew install redis && brew services start redis
```

### 4. MinIO
```bash
# Download binary for your OS from https://min.io/download
chmod +x minio
./minio server ~/minio-data --console-address ":9001"
# Web console: http://localhost:9001 (user: minioadmin / pass: minioadmin)
```

### 5. Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env              # Edit .env with your credentials

alembic upgrade head              # Run DB migrations

# Terminal 1 — API server
uvicorn main:socket_app --host 0.0.0.0 --port 8000 --reload

# Terminal 2 — Celery worker
celery -A tasks.recording_tasks worker --loglevel=info

# Terminal 3 (optional) — Flower UI at http://localhost:5555
celery -A tasks.recording_tasks flower --port=5555
```

### 6. Media server
```bash
cd media-server
npm install
node server.js
# Runs on http://localhost:3001
```

### 7. Frontend
```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:5173
```

### 8. Prometheus (optional)
```bash
./prometheus --config.file=observability/prometheus.yml
# http://localhost:9090
```

### 9. Grafana (optional)
```bash
./grafana-server
# http://localhost:3000  (admin / admin)
# Import: observability/grafana/dashboard.json
```

## Test the Platform

1. Open http://localhost:5173
2. Register an agent account
3. Create a session → copy the invite link
4. Open invite link in another browser tab (as customer)
5. Both should see each other on video

## Architecture

```
Browser → FastAPI (Python 8000) → mediasoup (Node.js 3001)
             ↓                          ↓
         PostgreSQL                  GStreamer
         Redis                       MinIO
         Celery
```

## Roles

| Role | Access |
|---|---|
| Agent | Create sessions, end calls, start/stop recording |
| Customer | Join via invite link only |
| Admin | All agent actions + force-end any session |

## Known Limitations

- GStreamer recording requires `gst-plugins-bad` installed
- `ANNOUNCED_IP` in `media-server/.env` must be set to your machine's IP for non-localhost calls
- MinIO presigned URLs expire after 24 hours (files) / 7 days (recordings)

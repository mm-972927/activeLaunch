from prometheus_client import Counter, Gauge, Histogram

active_sessions_gauge = Gauge(
    "active_sessions_total",
    "Number of currently active sessions",
)

connected_participants_gauge = Gauge(
    "connected_participants_total",
    "Number of participants currently in active calls",
)

sessions_created_counter = Counter(
    "sessions_created_total",
    "Total sessions created",
)

sessions_ended_counter = Counter(
    "sessions_ended_total",
    "Total sessions ended",
)

messages_sent_counter = Counter(
    "messages_sent_total",
    "Total chat messages sent",
)

files_uploaded_counter = Counter(
    "files_uploaded_total",
    "Total files uploaded in chat",
)

recordings_started_counter = Counter(
    "recordings_started_total",
    "Total call recordings started",
)

reconnects_counter = Counter(
    "reconnects_total",
    "Total successful reconnects within grace window",
)

# Zoom Clone (Video Conferencing Platform)

**Stack:** Next.js 14 (frontend) · Python FastAPI (backend) · SQLite (database)

## Run locally
Backend (http://localhost:8000):
```
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```
Frontend (http://localhost:3000):
```
cd frontend
npm install
npm run dev
```
The SQLite file (`backend/zoomapp.db`) and sample data are created automatically on first start.

## Features
Landing dashboard (New / Join / Schedule, Upcoming + Recent), instant meeting (unique 10-digit ID + invite link),
join by ID or link (existence validated, display name entered before joining), schedule meetings (topic, description,
date/time, duration, auto-generated link, stored in DB, shown in Upcoming), meeting room with camera/mic controls,
participants panel, chat, host controls (Mute All / Remove participant), a meeting-invitation dialog showing the generated link, responsive layout.

## Database schema
- `users(id, name, email)` – single seeded default user (Siddharth Malawat)
- `meetings(id, code UNIQUE, title, description, host_id → users, kind instant|scheduled, start_time, duration_min, status scheduled|live|ended)`
- `participants(id, meeting_id → meetings ON DELETE CASCADE, display_name, is_host, muted, joined_at, left_at)`

## Assumptions
- A default user (Siddharth Malawat) is always logged in; no authentication.
- Sample meetings are seeded on first run.
- Video shows only the local camera (getUserMedia); other participants are shown as avatar tiles from the database. Full multi-user media would need WebRTC/SFU signalling.
- Meeting chat is local to the browser session.
- Times are stored in UTC and displayed in the viewer's timezone.

## Deploy
- Backend → Render (Web Service). Root dir `backend`, build `pip install -r requirements.txt`, start `uvicorn main:app --host 0.0.0.0 --port $PORT`.
- Frontend → Vercel. Root dir `frontend`, env var `NEXT_PUBLIC_API_URL=<your Render URL>`.

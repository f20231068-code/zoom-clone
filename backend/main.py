import os, random, sqlite3
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

DB = os.path.join(os.path.dirname(__file__), "zoomapp.db")
app = FastAPI(title="Zoom Clone API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
now = lambda: datetime.now(timezone.utc)
iso = lambda d: d.strftime("%Y-%m-%dT%H:%M:%S+00:00")
parse = lambda s: datetime.fromisoformat(s.replace("Z", "+00:00"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS meetings(
  id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, title TEXT NOT NULL, description TEXT DEFAULT '',
  host_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN('instant','scheduled')), start_time TEXT NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 40,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN('scheduled','live','ended')));
CREATE TABLE IF NOT EXISTS participants(
  id INTEGER PRIMARY KEY, meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL, is_host INTEGER NOT NULL DEFAULT 0, muted INTEGER NOT NULL DEFAULT 0, joined_at TEXT NOT NULL, left_at TEXT);
CREATE INDEX IF NOT EXISTS idx_meetings_start ON meetings(start_time);
CREATE INDEX IF NOT EXISTS idx_participants_meeting ON participants(meeting_id);
"""

def db():
    c = sqlite3.connect(DB); c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON"); return c

def new_code(c):
    while True:
        k = str(random.randint(10**9, 10**10 - 1))
        if not c.execute("SELECT 1 FROM meetings WHERE code=?", (k,)).fetchone(): return k

def seed():
    c = db(); c.executescript(SCHEMA)
    if c.execute("SELECT COUNT(*) FROM users").fetchone()[0]: return
    c.execute("INSERT INTO users VALUES(1,'Siddharth Malawat','siddharth.malawat@example.com')")
    for t, d, off, dur, st in [
        ("Weekly Team Sync", "Sprint status", 3, 40, "scheduled"), ("Design Review", "Review onboarding flow", 26, 60, "scheduled"),
        ("Client Kickoff", "Project kickoff call", 50, 45, "scheduled"), ("Daily Standup", "", -24, 15, "ended"),
        ("1:1 with Priya", "", -48, 30, "ended"), ("Product Planning", "Q1 roadmap", -120, 60, "ended")]:
        at = iso(now() + timedelta(hours=off))
        cur = c.execute("INSERT INTO meetings(code,title,description,host_id,kind,start_time,duration_min,status) VALUES(?,?,?,?,?,?,?,?)",
                        (new_code(c), t, d, 1, "scheduled", at, dur, st))
        if st == "ended":
            for n, h in [("Siddharth Malawat", 1), ("Priya Shah", 0), ("Sam Lee", 0)]:
                c.execute("INSERT INTO participants(meeting_id,display_name,is_host,joined_at,left_at) VALUES(?,?,?,?,?)", (cur.lastrowid, n, h, at, at))
    c.commit()

seed()

def get(c, k):
    m = c.execute("SELECT m.*, u.name host_name FROM meetings m JOIN users u ON u.id=m.host_id WHERE code=?", (k,)).fetchone()
    if not m: raise HTTPException(404, "Invalid meeting ID. Please check and try again.")
    return dict(m)

class Instant(BaseModel): title: str = "Siddharth Malawat's Meeting"
class Schedule(BaseModel): title: str; description: str = ""; start_time: str; duration_min: int = 40
class Join(BaseModel): display_name: str; is_host: bool = False; muted: bool = False
class Mute(BaseModel): muted: bool

@app.get("/api/meetings")
def list_meetings():
    c = db(); out = {"upcoming": [], "recent": []}
    for r in c.execute("SELECT * FROM meetings ORDER BY start_time"):
        m = dict(r); end = parse(m["start_time"]) + timedelta(minutes=m["duration_min"])
        active = m["status"] == "live" or (m["status"] == "scheduled" and end > now())
        out["upcoming" if active else "recent"].append(m)
    out["recent"].reverse(); return out

@app.post("/api/meetings/instant")
def instant(b: Instant):
    c = db(); k = new_code(c)
    c.execute("INSERT INTO meetings(code,title,host_id,kind,start_time,status) VALUES(?,?,1,'instant',?,'live')", (k, b.title, iso(now())))
    c.commit(); return get(c, k)

@app.post("/api/meetings/schedule")
def schedule(b: Schedule):
    if not b.title.strip(): raise HTTPException(422, "Topic is required.")
    if b.duration_min <= 0: raise HTTPException(422, "Duration must be positive.")
    try: start = parse(b.start_time)
    except ValueError: raise HTTPException(422, "Invalid date/time.")
    c = db(); k = new_code(c)
    c.execute("INSERT INTO meetings(code,title,description,host_id,kind,start_time,duration_min) VALUES(?,?,?,1,'scheduled',?,?)",
              (k, b.title.strip(), b.description, iso(start), b.duration_min))
    c.commit(); return get(c, k)

@app.get("/api/meetings/{k}")
def meeting(k: str): return get(db(), k)

@app.post("/api/meetings/{k}/join")
def join(k: str, b: Join):
    c = db(); m = get(c, k)
    if m["status"] == "ended": raise HTTPException(410, "This meeting has ended.")
    name = b.display_name.strip()
    if not name: raise HTTPException(422, "Display name is required.")
    cur = c.execute("INSERT INTO participants(meeting_id,display_name,is_host,muted,joined_at) VALUES(?,?,?,?,?)", (m["id"], name, int(b.is_host), int(b.muted), iso(now())))
    c.execute("UPDATE meetings SET status='live' WHERE id=?", (m["id"],)); c.commit()
    return {"participant_id": cur.lastrowid, "meeting": m}

@app.get("/api/meetings/{k}/participants")
def participants(k: str):
    c = db(); m = get(c, k)
    return [dict(r) for r in c.execute("SELECT * FROM participants WHERE meeting_id=? AND left_at IS NULL ORDER BY id", (m["id"],))]

@app.post("/api/meetings/{k}/end")
def end(k: str):
    c = db(); m = get(c, k)
    c.execute("UPDATE participants SET left_at=? WHERE meeting_id=? AND left_at IS NULL", (iso(now()), m["id"]))
    c.execute("UPDATE meetings SET status='ended' WHERE id=?", (m["id"],)); c.commit(); return {"ok": True}

@app.post("/api/participants/{pid}/leave")
@app.delete("/api/participants/{pid}")  # host "remove participant"
def leave(pid: int):
    c = db(); c.execute("UPDATE participants SET left_at=? WHERE id=? AND left_at IS NULL", (iso(now()), pid)); c.commit(); return {"ok": True}

@app.post("/api/participants/{pid}/mute")
def mute(pid: int, b: Mute):
    c = db(); c.execute("UPDATE participants SET muted=? WHERE id=?", (int(b.muted), pid)); c.commit(); return {"ok": True}

@app.post("/api/meetings/{k}/mute-all")  # host control
def mute_all(k: str):
    c = db(); m = get(c, k)
    c.execute("UPDATE participants SET muted=1 WHERE meeting_id=? AND is_host=0 AND left_at IS NULL", (m["id"],)); c.commit(); return {"ok": True}

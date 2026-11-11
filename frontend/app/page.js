"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "../components/Icon";
import { api, fmtCode } from "../lib/api";

const when = (s) => new Date(s).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function Modal({ title, onClose, children }) {
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-h"><h3>{title}</h3><button className="x" onClick={onClose}>×</button></div>
        {children}
      </div>
    </div>
  );
}

function JoinModal({ onClose, go }) {
  const [v, setV] = useState(""); const [err, setErr] = useState("");
  const submit = async () => {
    const m = v.replace(/[\s-]/g, "").match(/\d{10}/);
    if (!m) return setErr("Enter a valid 10-digit meeting ID or invite link.");
    try {
      const mt = await api(`/meetings/${m[0]}`);
      if (mt.status === "ended") return setErr("This meeting has ended.");
      go(`/meeting/${m[0]}`);
    } catch (e) { setErr(e.message); }
  };
  return (
    <Modal title="Join Meeting" onClose={onClose}>
      <label className="field">Meeting ID or invite link
        <input autoFocus value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="123 456 7890" />
      </label>
      {err && <div className="err">{err}</div>}
      <div className="acts"><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={submit}>Join</button></div>
    </Modal>
  );
}

function ScheduleModal({ onClose, onDone }) {
  const d = new Date(Date.now() + 36e5);
  const [f, setF] = useState({ title: "", description: "", date: d.toLocaleDateString("en-CA"), time: `${String(d.getHours()).padStart(2, "0")}:00`, dur: 60 });
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async () => {
    try {
      const start = new Date(`${f.date}T${f.time}`);
      if (!f.title.trim()) throw new Error("Topic is required.");
      if (isNaN(start)) throw new Error("Pick a valid date and time.");
      const m = await api("/meetings/schedule", { method: "POST", body: { title: f.title.trim(), description: f.description, start_time: start.toISOString(), duration_min: +f.dur } });
      onDone(m);
    } catch (e) { setErr(e.message); }
  };
  return (
    <Modal title="Schedule Meeting" onClose={onClose}>
      <label className="field">Topic<input autoFocus value={f.title} onChange={set("title")} placeholder="My Meeting" /></label>
      <label className="field">Description (optional)<textarea rows={2} value={f.description} onChange={set("description")} /></label>
      <div className="two">
        <label className="field">Date<input type="date" value={f.date} onChange={set("date")} /></label>
        <label className="field">Time<input type="time" value={f.time} onChange={set("time")} /></label>
      </div>
      <label className="field">Duration
        <select value={f.dur} onChange={set("dur")}>{[15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} min</option>)}</select>
      </label>
      {err && <div className="err">{err}</div>}
      <div className="acts"><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={submit}>Save</button></div>
    </Modal>
  );
}

const fmtDay = (s) => new Date(s).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const fmtRange = (m) => {
  const a = new Date(m.start_time), b = new Date(a.getTime() + m.duration_min * 6e4);
  const f = (x) => x.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${f(a)} - ${f(b)}`;
};
const inviteText = (m) => `Siddharth Malawat is inviting you to a scheduled Zoom meeting.\n\nTopic: ${m.title}\nTime: ${fmtDay(m.start_time)} ${fmtRange(m)}\n\nJoin Zoom Meeting\n${location.origin}/meeting/${m.code}\n\nMeeting ID: ${fmtCode(m.code)}`;

function InviteModal({ m, onClose, onCopy }) {
  return (
    <Modal title="Meeting Invitation" onClose={onClose}>
      <pre className="invite">{inviteText(m)}</pre>
      <div className="acts"><button className="btn" onClick={onClose}>Close</button><button className="btn primary" onClick={() => onCopy(inviteText(m))}>Copy Meeting Invitation</button></div>
    </Modal>
  );
}

export default function Home() {
  const router = useRouter();
  const [data, setData] = useState({ upcoming: [], recent: [] });
  const [modal, setModal] = useState(null);
  const [inv, setInv] = useState(null);
  const [menu, setMenu] = useState(false);
  const [now, setNow] = useState(null);
  const [toast, setToast] = useState("");
  const say = (t) => { setToast(t); setTimeout(() => setToast(""), 2200); };
  const load = () => api("/meetings").then(setData).catch((e) => say(e.message));
  useEffect(() => { load(); setNow(new Date()); const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);

  const start = async () => {
    try { const m = await api("/meetings/instant", { method: "POST", body: {} }); router.push(`/meeting/${m.code}?host=1`); }
    catch (e) { say(e.message); }
  };
  const copy = (t) => navigator.clipboard.writeText(t).then(() => say("Copied to clipboard"));
  const today = now ? data.upcoming.filter((m) => new Date(m.start_time).toDateString() === now.toDateString()) : [];
  const go = (m) => router.push(`/meeting/${m.code}?host=1`);
  const tile = (color, icon, label, onClick) => (
    <button className={`tile ${color}`} onClick={onClick}><i><Icon n={icon} size={40} /></i>{label}</button>
  );
  const list = (title, items, upcoming) => (
    <section className="card"><h2>{title}</h2>
      {items.length === 0 && <div className="empty">No {upcoming ? "upcoming" : "recent"} meetings.</div>}
      {items.map((m) => (
        <div className="row" key={m.id}>
          <div className="when"><b>{fmtDay(m.start_time)}</b><small>{fmtRange(m)}</small></div>
          <div className="grow"><b>{m.title}</b><small>Meeting ID: {fmtCode(m.code)}</small></div>
          {upcoming && <>
            <button className="btn sm primary" onClick={() => go(m)}>{m.status === "live" ? "Rejoin" : "Start"}</button>
            <button className="btn sm" onClick={() => setInv(m)}>Invitation</button>
          </>}
        </div>
      ))}
    </section>
  );

  return (
    <>
      <header className="nav">
        <div className="logo">zoom</div>
        <div className="search"><Icon n="search" size={16} /><input placeholder="Search" /></div>
        <div className="nav-r">
          <button className="icon-btn" title="Settings" onClick={() => say("Settings (placeholder)")}><Icon n="gear" size={22} /></button>
          <button className="avatar" title="Siddharth Malawat" onClick={() => setMenu(!menu)}>SM<span className="dot" /></button>
          {menu && (
            <div className="menu" onMouseLeave={() => setMenu(false)}>
              <div className="who"><div className="avatar">SM</div><div>Siddharth Malawat<small>siddharth.malawat@example.com</small></div></div>
              <div className="mi">Profile</div><div className="mi">Settings</div><div className="mi">Sign out</div>
            </div>
          )}
        </div>
      </header>
      <div className="shell">
        <nav className="rail">
          {[["home", "Home"], ["calendar", "Meetings"], ["chat", "Team Chat"], ["people", "Contacts"]].map(([i, l], k) => (
            <div key={l} className={"rail-i" + (k === 0 ? " on" : "")}><span><Icon n={i} size={22} /></span>{l}</div>
          ))}
        </nav>
        <main className="main">
          <div className="home">
            <div className="tiles">
              {tile("orange", "video", "New Meeting", start)}
              {tile("blue", "plus", "Join Meeting", () => setModal("join"))}
              {tile("blue", "calendar", "Schedule Meeting", () => setModal("schedule"))}
            </div>
            <aside className="today">
              <div className="today-h">{now && <>
                <div className="time">{now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
                <div className="date">{now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</div>
              </>}</div>
              <div className="today-b">
                {today.length === 0 && <div className="empty">No upcoming meetings today</div>}
                {today.map((m) => (
                  <div className="trow" key={m.id}><div><b>{m.title}</b><small>{fmtRange(m)}</small></div><button className="btn sm primary" onClick={() => go(m)}>Start</button></div>
                ))}
              </div>
            </aside>
          </div>
          <div className="cols">{list("Upcoming Meetings", data.upcoming, true)}{list("Recent Meetings", data.recent, false)}</div>
        </main>
      </div>
      {modal === "join" && <JoinModal onClose={() => setModal(null)} go={(p) => router.push(p)} />}
      {modal === "schedule" && <ScheduleModal onClose={() => setModal(null)} onDone={(m) => { setModal(null); load(); setInv(m); }} />}
      {inv && <InviteModal m={inv} onClose={() => setInv(null)} onCopy={copy} />}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

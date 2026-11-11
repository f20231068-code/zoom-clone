"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Icon from "../../../components/Icon";
import { api, fmtCode, ini } from "../../../lib/api";

const Tb = ({ icon, label, off, onClick, badge }) => (
  <button className="tb" onClick={onClick}><div className="ic"><Icon n={icon} off={off} />{badge ? <em>{badge}</em> : null}</div><span>{label}</span></button>
);

export default function Meeting() {
  const { code } = useParams();
  const router = useRouter();
  const [meeting, setMeeting] = useState(null);
  const [err, setErr] = useState("");
  const [name, setName] = useState("");
  const [me, setMe] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [panel, setPanel] = useState(null);
  const [people, setPeople] = useState([]);
  const [chat, setChat] = useState([]);
  const [msg, setMsg] = useState("");
  const [endMenu, setEndMenu] = useState(false);
  const [toast, setToast] = useState("");
  const stream = useRef(null);
  const once = useRef(false);
  const setVid = (el) => { if (el && stream.current && el.srcObject !== stream.current) el.srcObject = stream.current; };

  async function enter(n, host) {
    try {
      const r = await api(`/meetings/${code}/join`, { method: "POST", body: { display_name: n, is_host: host, muted: !mic } });
      setMe(r.participant_id); setIsHost(host); setMeeting(r.meeting);
    } catch (e) { setErr(e.message); }
  }
  async function leave(all) {
    try { await api(all ? `/meetings/${code}/end` : `/participants/${me}/leave`, { method: "POST" }); } catch {}
    router.push("/");
  }
  const refresh = () => api(`/meetings/${code}/participants`).then(setPeople).catch(() => {});

  useEffect(() => {
    if (once.current) return; once.current = true;
    const host = new URLSearchParams(location.search).get("host") === "1";
    if (host) enter("Siddharth Malawat", true);
    else api(`/meetings/${code}`).then(setMeeting).catch((e) => setErr(e.message));
  }, []);

  useEffect(() => {
    let dead = false;
    navigator.mediaDevices?.getUserMedia({ video: true, audio: true }).then((s) => {
      if (dead) return s.getTracks().forEach((t) => t.stop());
      stream.current = s;
      document.querySelectorAll("video").forEach((v) => (v.srcObject = s));
    }).catch(() => setCam(false));
    return () => { dead = true; stream.current?.getTracks().forEach((t) => t.stop()); };
  }, []);

  useEffect(() => {
    if (!me) return;
    refresh();
    const t = setInterval(() => api(`/meetings/${code}/participants`).then((p) => {
      setPeople(p); if (!p.some((x) => x.id === me)) router.push("/");
    }).catch(() => {}), 3000);
    return () => clearInterval(t);
  }, [me]);

  const toggle = (k) => {
    const on = k === "mic" ? !mic : !cam;
    stream.current?.[k === "mic" ? "getAudioTracks" : "getVideoTracks"]().forEach((t) => (t.enabled = on));
    (k === "mic" ? setMic : setCam)(on);
    if (k === "mic" && me) api(`/participants/${me}/mute`, { method: "POST", body: { muted: !on } }).catch(() => {});
  };
  const copy = () => navigator.clipboard.writeText(`${location.origin}/meeting/${code}`).then(() => { setToast("Invite link copied"); setTimeout(() => setToast(""), 2000); });
  const send = () => { if (msg.trim()) { setChat([...chat, { from: mine?.display_name || name, text: msg.trim() }]); setMsg(""); } };

  const mine = people.find((p) => p.id === me);
  const others = people.filter((p) => p.id !== me);
  const label = mine?.display_name || name;
  useEffect(() => { if (mine?.muted && mic) toggle("mic"); }, [mine?.muted]);
  const muteAll = () => api(`/meetings/${code}/mute-all`, { method: "POST" }).then(() => { setToast("Muted all participants"); setTimeout(() => setToast(""), 2000); refresh(); });
  const selfTile = (
    <div className="vtile">
      <video ref={setVid} autoPlay muted playsInline style={{ display: cam ? "block" : "none" }} />
      {!cam && <div className="avatar big">{ini(label || "?")}</div>}
      <span className="nm">{!mic && <Icon n="mic" off size={14} />}{label || "You"} (Me)</span>
    </div>
  );

  if (err) return (
    <div className="center"><div>
      <h2>{err}</h2>
      <p style={{ color: "#747487", margin: "8px 0 20px" }}>Check the meeting ID or invite link and try again.</p>
      <button className="btn primary" onClick={() => router.push("/")}>Back to Home</button>
    </div></div>
  );
  if (!meeting) return <div className="center">Loading…</div>;

  if (!me) return (
    <div className="prejoin">
      {selfTile}
      <div className="pj-form">
        <h2>{meeting.title}</h2>
        <p>Meeting ID {fmtCode(code)}</p>
        <label className="field">Your name
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim() && enter(name.trim(), false)} placeholder="Enter your name" />
        </label>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <Tb icon="mic" label={mic ? "Mute" : "Unmute"} off={!mic} onClick={() => toggle("mic")} />
          <Tb icon="video" label={cam ? "Stop Video" : "Start Video"} off={!cam} onClick={() => toggle("cam")} />
        </div>
        <button className="btn primary" style={{ width: "100%" }} disabled={!name.trim()} onClick={() => enter(name.trim(), false)}>Join</button>
      </div>
    </div>
  );

  return (
    <div className="room">
      <div className="room-top">
        <div className="chip" onClick={copy} title="Copy invite link">{meeting.title} · ID {fmtCode(code)} · Copy invite</div>
        <div>{people.length} in meeting</div>
      </div>
      <div className="stage">
        <div className="grid">
          {selfTile}
          {others.map((p) => (
            <div className="vtile" key={p.id}>
              <div className="avatar big">{ini(p.display_name)}</div>
              <span className="nm">{p.muted ? <Icon n="mic" off size={14} /> : null}{p.display_name}{p.is_host ? " (Host)" : ""}</span>
            </div>
          ))}
        </div>
        {panel && (
          <div className="panel">
            <div className="panel-h">{panel === "people" ? `Participants (${people.length})` : "Chat"}<button className="x" onClick={() => setPanel(null)}>×</button></div>
            <div className="panel-b">
              {panel === "people" ? people.map((p) => (
                <div className="prow" key={p.id}>
                  <div className="avatar">{ini(p.display_name)}</div>
                  <div className="grow">{p.display_name}{p.id === me ? " (Me)" : ""}{p.is_host ? " (Host)" : ""}</div>
                  {p.muted && <Icon n="mic" off size={18} />}
                  {isHost && p.id !== me && <button className="btn sm" onClick={() => api(`/participants/${p.id}`, { method: "DELETE" }).then(refresh)}>Remove</button>}
                </div>
              )) : chat.map((c, i) => <div className="msg" key={i}><b>{c.from}:</b> {c.text}</div>)}
            </div>
            {panel === "people" && isHost && <div className="panel-f"><button className="btn" onClick={muteAll}>Mute All</button></div>}
            {panel === "chat" && <div className="panel-f"><input value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Type message here..." /></div>}
          </div>
        )}
      </div>
      <div className="bar">
        <div style={{ width: 72 }} />
        <div className="bar-m">
          <Tb icon="mic" label={mic ? "Mute" : "Unmute"} off={!mic} onClick={() => toggle("mic")} />
          <Tb icon="video" label={cam ? "Stop Video" : "Start Video"} off={!cam} onClick={() => toggle("cam")} />
          <Tb icon="people" label="Participants" badge={people.length} onClick={() => setPanel(panel === "people" ? null : "people")} />
          <Tb icon="chat" label="Chat" onClick={() => setPanel(panel === "chat" ? null : "chat")} />
        </div>
        <button className="btn red" onClick={() => (isHost ? setEndMenu(true) : leave(false))}>{isHost ? "End" : "Leave"}</button>
      </div>
      {endMenu && (
        <div className="overlay" onMouseDown={() => setEndMenu(false)}>
          <div className="modal" style={{ maxWidth: 320 }} onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ display: "grid", gap: 10 }}>
              <button className="btn red" onClick={() => leave(true)}>End Meeting for All</button>
              <button className="btn" onClick={() => leave(false)}>Leave Meeting</button>
              <button className="btn" onClick={() => setEndMenu(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

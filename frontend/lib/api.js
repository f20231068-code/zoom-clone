export const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function api(path, opts = {}) {
  let r;
  try {
    r = await fetch(API + "/api" + path, {
      headers: { "Content-Type": "application/json" }, ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch { throw new Error("Cannot reach the server. Is the backend running?"); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof d.detail === "string" ? d.detail : "Request failed");
  return d;
}
export const fmtCode = (c) => c.replace(/(\d{3})(\d{3})(\d+)/, "$1 $2 $3");
export const ini = (n) => n.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

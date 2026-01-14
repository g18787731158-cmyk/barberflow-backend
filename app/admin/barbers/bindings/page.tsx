"use client";

import { useEffect, useMemo, useState } from "react";

const BASE_URL = ""; // 同域部署留空即可

export default function AdminBarberBindingsPage() {
  const [token, setToken] = useState("");
  const [shopId, setShopId] = useState("1");
  const [loading, setLoading] = useState(false);
  const [barbers, setBarbers] = useState<any[]>([]);
  const [err, setErr] = useState("");

  const masked = useMemo(() => (s: string | null) => {
    if (!s) return "";
    if (s.length <= 10) return s;
    return s.slice(0, 6) + "..." + s.slice(-4);
  }, []);

  async function load() {
    if (!token) {
      setErr("先输入管理员口令");
      return;
    }
    setErr("");
    setLoading(true);
    try {
      const r = await fetch(`${BASE_URL}/api/admin/barbers?shopId=${encodeURIComponent(shopId)}`, {
        headers: { "x-admin-token": token },
        cache: "no-store",
      });
      const d = await r.json();
      if (!d?.ok) throw new Error(d?.error || "load failed");
      setBarbers(d.barbers || []);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function unbind(barberId: number, name: string) {
    if (!token) return setErr("先输入管理员口令");
    if (!confirm(`确认解绑：${name}（ID ${barberId}）？`)) return;

    setErr("");
    try {
      const r = await fetch(`${BASE_URL}/api/admin/barbers`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-token": token },
        body: JSON.stringify({ action: "unbind", barberId }),
      });
      const d = await r.json();
      if (!d?.ok) throw new Error(d?.error || "unbind failed");
      await load();
      alert("解绑成功");
    } catch (e: any) {
      setErr(String(e?.message || e));
    }
  }

  useEffect(() => {
    // 你如果嫌每次输口令麻烦，可以解开这段：localStorage 记住
    try {
      const t = localStorage.getItem("bf_admin_token") || "";
      if (t) setToken(t);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      if (token) localStorage.setItem("bf_admin_token", token);
    } catch {}
  }, [token]);

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>理发师绑定管理</h2>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <input
          placeholder="管理员口令（ADMIN_TOKEN）"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(255,255,255,0.18)", width: 260 }}
        />
        <input
          placeholder="shopId"
          value={shopId}
          onChange={(e) => setShopId(e.target.value)}
          style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(255,255,255,0.18)", width: 100 }}
        />
        <button onClick={load} disabled={loading} style={{ padding: "10px 14px", borderRadius: 10 }}>
          {loading ? "加载中…" : "刷新"}
        </button>
      </div>

      {err ? <div style={{ opacity: 0.85, marginBottom: 12 }}>⚠️ {err}</div> : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {barbers.map((b) => (
          <div
            key={b.id}
            style={{
              padding: 14,
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.12)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: 700 }}>{b.name}（ID {b.id}）</div>
              <div style={{ opacity: 0.75, marginTop: 6 }}>
                绑定：{b.openid ? `✅ ${masked(b.openid)}` : "❌ 未绑定"}
              </div>
            </div>

            <button
              onClick={() => unbind(b.id, b.name)}
              disabled={!b.openid}
              style={{ padding: "10px 14px", borderRadius: 10, opacity: b.openid ? 1 : 0.45 }}
            >
              解绑
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

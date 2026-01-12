// app/api/miniapp/login/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const code = body?.code;

    if (!code || typeof code !== "string") {
      return NextResponse.json({ ok: false, error: "missing code" }, { status: 400 });
    }

    const appid = process.env.WECHAT_MP_APPID;
    const secret = process.env.WECHAT_MP_SECRET;

    if (!appid || !secret) {
      return NextResponse.json(
        { ok: false, error: "missing env WECHAT_MP_APPID/WECHAT_MP_SECRET" },
        { status: 500 }
      );
    }

    const url =
      "https://api.weixin.qq.com/sns/jscode2session" +
      `?appid=${encodeURIComponent(appid)}` +
      `&secret=${encodeURIComponent(secret)}` +
      `&js_code=${encodeURIComponent(code)}` +
      `&grant_type=authorization_code`;

    const r = await fetch(url, { method: "GET" });
    const data = await r.json();

    // 失败示例：{ errcode: 40029, errmsg: "invalid code" }
    if (data?.errcode) {
      return NextResponse.json(
        { ok: false, error: "jscode2session failed", detail: data },
        { status: 400 }
      );
    }

    const { openid, unionid } = data as { openid?: string; unionid?: string };

    if (!openid) {
      return NextResponse.json(
        { ok: false, error: "wx response missing openid", detail: data },
        { status: 400 }
      );
    }

    // MVP：先直接回 openid（下一步我们会改为签发你自己的 session token）
    return NextResponse.json({ ok: true, openid, unionid: unionid ?? null });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "server error", detail: String(e?.message || e) },
      { status: 500 }
    );
  }
}

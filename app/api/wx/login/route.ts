// app/api/wx/login/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { code } = await req.json();

    if (!code || typeof code !== "string") {
      return NextResponse.json({ error: "missing code" }, { status: 400 });
    }

    const appid = process.env.WECHAT_MP_APPID;
    const secret = process.env.WECHAT_MP_SECRET;

    if (!appid || !secret) {
      return NextResponse.json(
        { error: "server env missing WECHAT_MP_APPID/WECHAT_MP_SECRET" },
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

    // 微信返回错误示例：{ errcode: 40029, errmsg: "invalid code" }
    if (data.errcode) {
      return NextResponse.json(
        { error: "wx jscode2session failed", detail: data },
        { status: 400 }
      );
    }

    // 重要：session_key 不要回给前端
    const { openid, unionid } = data as { openid: string; unionid?: string };

    if (!openid) {
      return NextResponse.json(
        { error: "wx response missing openid", detail: data },
        { status: 400 }
      );
    }

    // MVP：先直接回 openid（后面我们会换成你后端签发的 session token）
    return NextResponse.json({ ok: true, openid, unionid: unionid ?? null });
  } catch (e: any) {
    return NextResponse.json(
      { error: "server error", detail: String(e?.message || e) },
      { status: 500 }
    );
  }
}

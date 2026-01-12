import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 复用 Prisma 实例，避免 dev 热更新重复连接
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

async function codeToOpenid(code: string) {
  const appid = process.env.WECHAT_MP_APPID;
  const secret = process.env.WECHAT_MP_SECRET;

  if (!appid || !secret) {
    throw new Error("missing env WECHAT_MP_APPID/WECHAT_MP_SECRET");
  }

  const url =
    "https://api.weixin.qq.com/sns/jscode2session" +
    `?appid=${encodeURIComponent(appid)}` +
    `&secret=${encodeURIComponent(secret)}` +
    `&js_code=${encodeURIComponent(code)}` +
    `&grant_type=authorization_code`;

  const r = await fetch(url, { method: "GET" });
  const data = await r.json();

  if (data?.errcode) {
    const err: any = new Error(`jscode2session failed: ${data.errcode} ${data.errmsg}`);
    err.wxDetail = data;
    throw err;
  }

  if (!data?.openid) {
    const err: any = new Error("wx response missing openid");
    err.wxDetail = data;
    throw err;
  }

  return data.openid as string;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const code = body?.code;
    const barberId = Number(body?.barberId);
    const bindCode = body?.bindCode; // 可选：绑定码
    const force = Boolean(body?.force); // 可选：强制覆盖（测试用）

    if (!code || typeof code !== "string") {
      return NextResponse.json({ ok: false, error: "missing code" }, { status: 400 });
    }
    if (!barberId || Number.isNaN(barberId)) {
      return NextResponse.json({ ok: false, error: "missing barberId" }, { status: 400 });
    }

    // ✅ 可选安全阀：如果你在 ECS .env 配了 BARBER_BIND_CODE，就必须校验
    const requiredBindCode = process.env.BARBER_BIND_CODE;
    if (requiredBindCode) {
      if (!bindCode || bindCode !== requiredBindCode) {
        return NextResponse.json({ ok: false, error: "invalid bindCode" }, { status: 403 });
      }
    }

    const openid = await codeToOpenid(code);

    const barber = await prisma.barber.findUnique({
      where: { id: barberId },
      select: { id: true, name: true, openid: true, shopId: true },
    });

    if (!barber) {
      return NextResponse.json({ ok: false, error: "barber not found" }, { status: 404 });
    }

    // 已绑定且不是同一个 openid：默认不允许覆盖（更安全）
    if (barber.openid && barber.openid !== openid && !force) {
      return NextResponse.json(
        {
          ok: false,
          error: "barber already bound",
          detail: { barberId: barber.id, barberOpenid: barber.openid },
        },
        { status: 409 }
      );
    }

    // openid 唯一：如果 openid 已经绑定到别的 barber，会触发 unique 冲突
    const updated = await prisma.barber.update({
      where: { id: barberId },
      data: { openid },
      select: { id: true, name: true, shopId: true, openid: true },
    });

    return NextResponse.json({ ok: true, barber: updated });
  } catch (e: any) {
    // Prisma unique 冲突 / 微信错误 / 其他错误都会进这里
    return NextResponse.json(
      {
        ok: false,
        error: "server error",
        detail: String(e?.message || e),
        wxDetail: e?.wxDetail ?? null,
      },
      { status: 500 }
    );
  }
}

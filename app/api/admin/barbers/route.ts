import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

function requireAdmin(req: Request) {
  const token = req.headers.get("x-admin-token") || "";
  const expected = process.env.ADMIN_TOKEN || "";
  if (!expected) {
    // 没配 ADMIN_TOKEN 就直接拒绝（避免裸奔）
    return { ok: false, res: NextResponse.json({ ok: false, error: "ADMIN_TOKEN not set" }, { status: 500 }) };
  }
  if (token !== expected) {
    return { ok: false, res: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  }
  return { ok: true as const };
}

// GET /api/admin/barbers?shopId=1
export async function GET(req: Request) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.res;

  const { searchParams } = new URL(req.url);
  const shopId = Number(searchParams.get("shopId") || "0") || undefined;

  const barbers = await prisma.barber.findMany({
    where: shopId ? { shopId } : undefined,
    orderBy: { id: "asc" },
    select: { id: true, name: true, shopId: true, openid: true, updatedAt: true },
  });

  return NextResponse.json({ ok: true, barbers });
}

// POST /api/admin/barbers  { action:"unbind", barberId: 1 }
export async function POST(req: Request) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "");
  const barberId = Number(body?.barberId);

  if (action !== "unbind") {
    return NextResponse.json({ ok: false, error: "invalid action" }, { status: 400 });
  }
  if (!barberId || Number.isNaN(barberId)) {
    return NextResponse.json({ ok: false, error: "missing barberId" }, { status: 400 });
  }

  const barber = await prisma.barber.findUnique({
    where: { id: barberId },
    select: { id: true, name: true, shopId: true, openid: true },
  });
  if (!barber) return NextResponse.json({ ok: false, error: "barber not found" }, { status: 404 });

  const updated = await prisma.barber.update({
    where: { id: barberId },
    data: { openid: null },
    select: { id: true, name: true, shopId: true, openid: true, updatedAt: true },
  });

  return NextResponse.json({ ok: true, barber: updated });
}

import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const barberId = Number(searchParams.get("barberId"));

    if (!barberId || Number.isNaN(barberId)) {
      return NextResponse.json({ ok: false, error: "missing barberId" }, { status: 400 });
    }

    const barber = await prisma.barber.findUnique({
      where: { id: barberId },
      select: { id: true, name: true, openid: true, updatedAt: true },
    });

    if (!barber) {
      return NextResponse.json({ ok: false, error: "barber not found" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      barberId: barber.id,
      name: barber.name,
      bound: Boolean(barber.openid),
      openid: barber.openid ?? null,
      updatedAt: barber.updatedAt,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "server error", detail: String(e?.message || e) },
      { status: 500 }
    );
  }
}

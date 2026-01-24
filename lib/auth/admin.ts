import { NextResponse } from "next/server";
import crypto from "crypto";

type AdminAuthOk = { ok: true };
type AdminAuthFail = { ok: false; res: NextResponse };
export type AdminAuthResult = AdminAuthOk | AdminAuthFail;

function timingSafeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);

  if (aBuf.length !== bBuf.length) {
    const padded = Buffer.alloc(aBuf.length);
    bBuf.copy(padded);
    crypto.timingSafeEqual(aBuf, padded);
    return false;
  }

  return crypto.timingSafeEqual(aBuf, bBuf);
}

function extractBearer(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

export function getAdminToken(req: Request) {
  return extractBearer(req) || req.headers.get("x-admin-token") || "";
}

export function requireAdmin(req: Request): AdminAuthResult {
  const expected = process.env.ADMIN_TOKEN || "";
  if (!expected) {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: "ADMIN_TOKEN not set" }, { status: 500 }),
    };
  }

  const token = getAdminToken(req);
  if (!token || !timingSafeEqual(token, expected)) {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    };
  }

  return { ok: true };
}

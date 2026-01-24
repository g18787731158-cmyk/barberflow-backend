import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";

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

function extractBearer(req: NextApiRequest) {
  const auth = (req.headers.authorization || "") as string;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

export function getAdminTokenPages(req: NextApiRequest) {
  const bearer = extractBearer(req);
  const headerToken = (req.headers["x-admin-token"] as string) || "";
  return bearer || headerToken || "";
}

export function requireAdminPages(req: NextApiRequest, res: NextApiResponse) {
  // 生产环境直接 404：彻底杜绝绕过
  if (process.env.NODE_ENV === "production") {
    res.status(404).json({ error: "not found" });
    return false;
  }

  const expected = process.env.ADMIN_TOKEN || "";
  if (!expected) {
    res.status(500).json({ ok: false, error: "ADMIN_TOKEN not set" });
    return false;
  }

  const token = getAdminTokenPages(req);
  if (!token || !timingSafeEqual(token, expected)) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return false;
  }

  return true;
}

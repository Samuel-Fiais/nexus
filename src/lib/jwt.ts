import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

if (!process.env.AUTH_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("AUTH_SECRET is required in production. Set a strong random secret in the environment.");
}

const SECRET = process.env.AUTH_SECRET || "nexus-dev-secret-change-in-production";
const ALGO = "HS256";
const TOKEN_EXPIRY = 14 * 24 * 60 * 60; // 14 days in seconds

function hmacSign(payload: string): string {
  const hmac = createHmac("sha256", SECRET);
  hmac.update(payload);
  return hmac.digest("base64url");
}

export type JwtPayload = {
  sub: string;
  tenantId: string;
  tenantName: string;
  email: string;
  name: string;
  role: "admin" | "user";
  iat: number;
  exp: number;
};

export function createToken(user: {
  id: string;
  tenantId: string;
  tenantName: string;
  email: string;
  name: string;
  role: "admin" | "user";
}): string {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + TOKEN_EXPIRY;
  const header = { alg: ALGO, typ: "JWT" };
  const payload: JwtPayload = {
    sub: user.id,
    tenantId: user.tenantId,
    tenantName: user.tenantName,
    email: user.email,
    name: user.name,
    role: user.role,
    iat,
    exp,
  };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = hmacSign(`${headerB64}.${payloadB64}`);
  return `${headerB64}.${payloadB64}.${signature}`;
}

export function verifyToken(token: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signature] = parts;
  const expectedSig = hmacSign(`${headerB64}.${payloadB64}`);

  try {
    const sigBuf = Buffer.from(signature, "base64url");
    const expectedBuf = Buffer.from(expectedSig, "base64url");
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
  } catch {
    return null;
  }

  let payload: JwtPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}

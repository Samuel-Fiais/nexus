import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { createToken, verifyToken, type JwtPayload } from "@/lib/jwt";

export type SessionUser = {
  id: string;
  tenantId: string;
  tenantName: string;
  email: string;
  name: string;
  role: "admin" | "user";
};

function payloadToUser(p: JwtPayload): SessionUser {
  return {
    id: p.sub,
    tenantId: p.tenantId,
    tenantName: p.tenantName,
    email: p.email,
    name: p.name,
    role: p.role,
  };
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 14 * 24 * 60 * 60, // 14 days
  };
}

export async function signInWithEmail(email: string) {
  // Import db lazily to avoid circular deps
  const { findUserByEmail } = await import("@/lib/db");
  const user = findUserByEmail(email);
  if (!user) return null;

  const token = createToken(user);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, cookieOptions());
  return user;
}

export async function signOut() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  return payloadToUser(payload);
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}

import type { NextRequest } from "next/server";

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function readJson<T>(request: NextRequest | Request) {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

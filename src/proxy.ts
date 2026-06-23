import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-cookie";

const PUBLIC_PATHS = ["/login"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = !!request.cookies.get(SESSION_COOKIE)?.value;
  const isPublicPath = PUBLIC_PATHS.includes(pathname);

  if (isPublicPath && hasSessionCookie) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (!isPublicPath && !hasSessionCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

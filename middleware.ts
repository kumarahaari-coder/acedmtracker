import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isAuth = !!req.auth;
  const pathname = req.nextUrl.pathname;

  // Allow public routes
  const isPublicRoute =
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/guest") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname === "/favicon.ico";

  if (!isAuth && !isPublicRoute) {
    const signInUrl = new URL("/api/auth/signin", req.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", req.nextUrl.href);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api/auth routes
     * - _next/static, _next/image
     * - guest review pages
     * - image assets (.png, .jpg, .svg, etc.)
     */
    "/((?!api/auth|_next/static|_next/image|guest|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

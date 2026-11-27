import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

// /admin is shared by STAFF and ADMIN (back-office staff); routes/APIs that only an
// ADMIN/owner should touch (courts, pricing, staff accounts) check role === "ADMIN" themselves.
export default auth((req) => {
  const isAdminRoute = req.nextUrl.pathname.startsWith("/admin");
  const role = req.auth?.user?.role;
  if (isAdminRoute && role !== "ADMIN" && role !== "STAFF") {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*"],
  // The jwt callback's periodic role re-check queries Postgres via Prisma, which needs the
  // Node.js runtime — the Edge runtime (middleware's default) can't run that driver.
  runtime: "nodejs",
};

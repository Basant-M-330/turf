import type { Session } from "next-auth";

export function isStaffOrAdmin(session: Session | null) {
  return session?.user?.role === "STAFF" || session?.user?.role === "ADMIN";
}

export function isAdmin(session: Session | null) {
  return session?.user?.role === "ADMIN";
}

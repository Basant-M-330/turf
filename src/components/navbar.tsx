import Link from "next/link";
import { auth } from "@/lib/auth";
import { SignOutButton } from "@/components/sign-out-button";

export async function Navbar() {
  const session = await auth();
  const role = session?.user?.role;

  return (
    <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-600 text-sm text-white">
            T
          </span>
          Turf Booking
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/" className="text-gray-600 transition hover:text-emerald-700">
            Book now
          </Link>
          {session?.user && (
            <Link href="/my-bookings" className="text-gray-600 transition hover:text-emerald-700">
              My Bookings
            </Link>
          )}
          {(role === "ADMIN" || role === "STAFF") && (
            <Link href="/admin" className="text-gray-600 transition hover:text-emerald-700">
              Admin
            </Link>
          )}
          {session?.user ? (
            <div className="flex items-center gap-3 border-l border-gray-200 pl-5">
              <span className="text-gray-500">{session.user.name}</span>
              <SignOutButton />
            </div>
          ) : (
            <div className="flex items-center gap-3 border-l border-gray-200 pl-5">
              <Link href="/login" className="text-gray-600 transition hover:text-emerald-700">
                Sign in
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-emerald-600 px-3.5 py-1.5 font-medium text-white transition hover:bg-emerald-700"
              >
                Sign up
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}

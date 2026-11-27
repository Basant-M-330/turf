import Link from "next/link";
import { brandLegalName } from "@/lib/config";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-gray-500 sm:flex-row">
        <p>© {year} {brandLegalName}. All rights reserved.</p>
        <nav className="flex gap-4">
          <Link href="/terms" className="hover:text-emerald-700">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-emerald-700">
            Privacy
          </Link>
          <Link href="/refund-policy" className="hover:text-emerald-700">
            Refund Policy
          </Link>
          <Link href="/contact" className="hover:text-emerald-700">
            Contact
          </Link>
        </nav>
      </div>
    </footer>
  );
}

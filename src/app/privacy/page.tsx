import { brandLegalName } from "@/lib/config";

export default function PrivacyPage() {
  return (
    <article className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-gray-900">Privacy Policy</h1>
      <p className="mt-1 text-sm text-gray-500">Last updated: 27 November 2026</p>

      <div className="mt-6 space-y-6 text-sm leading-6 text-gray-700">
        <p>
          This Privacy Policy explains how <strong>{brandLegalName}</strong> (&quot;we&quot;, &quot;us&quot;)
          collects, uses, and protects your information when you use this turf booking website.
        </p>

        <section>
          <h2 className="text-base font-semibold text-gray-900">1. Information we collect</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Account details: name, email address, phone number, and password (stored as a secure hash).</li>
            <li>Booking details: court, date, time, amount paid, and payment status.</li>
            <li>
              Payment information: online payments are processed by Razorpay. We receive confirmation of
              payment status only — we never see or store your card, UPI, or bank details.
            </li>
            <li>A session cookie used to keep you signed in.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">2. How we use this information</h2>
          <p className="mt-2">
            We use your information to create and manage your bookings, process payments, contact you
            about a booking, and operate the venue (for example, staff checking who has booked a slot).
            We do not sell your personal information.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">3. Who we share it with</h2>
          <p className="mt-2">
            We share booking and payment details with Razorpay solely to process payments. Venue staff
            and admins can see booking details needed to run the venue. We do not share your information
            with any other third party except where required by law.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">4. Data retention</h2>
          <p className="mt-2">
            We keep account and booking records for as long as your account is active, and afterwards
            for as long as needed for accounting and legal purposes.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">5. Your rights</h2>
          <p className="mt-2">
            You can ask us to access, correct, or delete your personal information at any time via our{" "}
            <a href="/contact" className="text-emerald-700 underline">Contact page</a>.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">6. Children&apos;s privacy</h2>
          <p className="mt-2">
            This service is intended for users who are at least 18 years old, or who book with the
            involvement of a parent or guardian.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">7. Changes to this policy</h2>
          <p className="mt-2">We may update this Privacy Policy from time to time; the date above reflects the latest revision.</p>
        </section>
      </div>
    </article>
  );
}

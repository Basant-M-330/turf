import { brandLegalName } from "@/lib/config";

export default function TermsPage() {
  return (
    <article className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-gray-900">Terms of Service</h1>
      <p className="mt-1 text-sm text-gray-500">Last updated: 27 November 2026</p>

      <div className="mt-6 space-y-6 text-sm leading-6 text-gray-700">
        <p>
          These Terms of Service (&quot;Terms&quot;) govern your use of this turf booking website,
          operated by <strong>{brandLegalName}</strong> (&quot;we&quot;, &quot;us&quot;, or &quot;the Venue&quot;). By
          creating an account or booking a slot, you agree to these Terms.
        </p>

        <section>
          <h2 className="text-base font-semibold text-gray-900">1. Bookings and slot holds</h2>
          <p className="mt-2">
            When you select a slot, it is held for you for 5 minutes while you complete checkout. During
            this hold, no other customer can book that slot. If checkout is not completed within 5
            minutes, the hold expires automatically and the slot becomes available to others again.
            A booking is only confirmed once payment is completed (in full or in part) or you choose
            to pay at the venue.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">2. Pricing and payment</h2>
          <p className="mt-2">
            Slot prices are set by the Venue and may vary by day and time. At checkout you may choose
            to pay the full amount online, pay a partial deposit online, or pay the remaining or full
            amount at the venue. Online payments are processed by Razorpay; we do not store your card
            or payment details.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">3. Cancellations</h2>
          <p className="mt-2">
            You may cancel a booking from your account. Refunds for cancelled bookings are handled per
            our <a href="/refund-policy" className="text-emerald-700 underline">Refund &amp; Cancellation Policy</a>.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">4. Conduct and assumption of risk</h2>
          <p className="mt-2">
            Sports and physical activity carry an inherent risk of injury. By booking a slot, you
            acknowledge this risk and agree to use the facility responsibly, follow any posted rules,
            and avoid damaging equipment or the playing surface. The Venue is not liable for injuries
            arising from normal play, except where caused by our negligence.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">5. Accounts</h2>
          <p className="mt-2">
            You are responsible for keeping your login credentials confidential and for all activity
            under your account. Provide accurate contact details so we can reach you about your booking.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">6. Changes to these Terms</h2>
          <p className="mt-2">
            We may update these Terms from time to time. Continued use of the site after an update
            means you accept the revised Terms.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">7. Contact</h2>
          <p className="mt-2">
            Questions about these Terms? See our{" "}
            <a href="/contact" className="text-emerald-700 underline">Contact page</a>.
          </p>
        </section>
      </div>
    </article>
  );
}

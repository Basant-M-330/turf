export default function RefundPolicyPage() {
  return (
    <article className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-gray-900">Refund &amp; Cancellation Policy</h1>
      <p className="mt-1 text-sm text-gray-500">Last updated: 27 November 2026</p>

      <div className="mt-6 space-y-6 text-sm leading-6 text-gray-700">
        <section>
          <h2 className="text-base font-semibold text-gray-900">1. Unconfirmed holds</h2>
          <p className="mt-2">
            A slot you select is held for 5 minutes only. If you don&apos;t complete payment or choose
            pay-at-venue within that time, the hold simply expires — nothing is charged, and there is
            nothing to cancel or refund.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">2. Cancelling a confirmed booking</h2>
          <p className="mt-2">
            You can cancel a confirmed booking from &quot;My Bookings&quot; any time before your slot
            starts. Venue staff may also cancel a booking on request.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">3. Refunds for online payments</h2>
          <p className="mt-2">
            If you paid in full or partially online and cancel your booking, any amount paid online is
            refunded to your original payment method via Razorpay. Refunds are typically processed within
            5–7 business days, depending on your bank or payment provider.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">4. Pay-at-venue bookings</h2>
          <p className="mt-2">
            If you chose to pay at the venue and haven&apos;t paid yet, cancelling simply releases the
            slot — there is nothing to refund.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">5. Venue-initiated cancellations</h2>
          <p className="mt-2">
            If the Venue needs to cancel your booking (for example, due to maintenance or weather), you
            will receive a full refund of any amount paid online, or the option to rebook another slot.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">6. Questions or disputes</h2>
          <p className="mt-2">
            For any refund questions, reach out via our{" "}
            <a href="/contact" className="text-emerald-700 underline">Contact page</a>.
          </p>
        </section>
      </div>
    </article>
  );
}

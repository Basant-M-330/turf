import { brandLegalName, supportEmail } from "@/lib/config";

export default function ContactPage() {
  return (
    <article className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-gray-900">Contact</h1>
      <p className="mt-4 text-sm leading-6 text-gray-700">
        This site is operated by <strong>{brandLegalName}</strong>. For questions about a booking,
        payments, refunds, or anything else, reach out to us:
      </p>
      <div className="mt-6 space-y-2 text-sm text-gray-700">
        <p>
          Email:{" "}
          <a href={`mailto:${supportEmail}`} className="text-emerald-700 underline">
            {supportEmail}
          </a>
        </p>
      </div>
      <p className="mt-6 text-sm text-gray-500">
        For questions about a specific booking, please include the date, time, and court so we can
        help you faster.
      </p>
    </article>
  );
}

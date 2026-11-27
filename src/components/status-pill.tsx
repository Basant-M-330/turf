const STATUS_LABEL: Record<string, string> = {
  HOLD: "Pending",
  CONFIRMED: "Confirmed",
  PARTIALLY_PAID: "Partially paid",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  COMPLETED: "Completed",
};

const STATUS_STYLE: Record<string, string> = {
  HOLD: "bg-amber-50 text-amber-700",
  CONFIRMED: "bg-emerald-50 text-emerald-700",
  PARTIALLY_PAID: "bg-blue-50 text-blue-700",
  CANCELLED: "bg-gray-100 text-gray-500",
  EXPIRED: "bg-gray-100 text-gray-500",
  COMPLETED: "bg-emerald-100 text-emerald-800",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        STATUS_STYLE[status] ?? "bg-gray-100 text-gray-500"
      }`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

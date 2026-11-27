import { Clock3, MapPin, Tag } from "lucide-react";
import type { Court, OperatingHours, PricingRule } from "@prisma/client";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { CourtBooking } from "@/components/court-booking";
import { formatRupees } from "@/lib/format";

const SPORT_LABEL: Record<string, string> = {
  FOOTBALL: "Football",
  CRICKET: "Cricket",
  BADMINTON: "Badminton",
  TENNIS: "Tennis",
  BASKETBALL: "Basketball",
  OTHER: "Sports",
};

type CourtWithSchedule = Court & { operatingHours: OperatingHours[]; pricingRules: PricingRule[] };

/** The hero + quick facts + how-it-works + booking widget for one court — shared by the
 * single-court home page and the multi-court `/courts/[id]` page. */
export function CourtPage({ court }: { court: CourtWithSchedule }) {
  const startingPrice = court.pricingRules.length
    ? Math.min(...court.pricingRules.map((r) => r.pricePerSlot))
    : null;

  return (
    <div className="space-y-10">
      <Hero
        images={court.images}
        name={court.name}
        sportLabel={SPORT_LABEL[court.sportType] ?? court.sportType}
        description={court.description}
      />

      <div className="flex flex-wrap gap-3">
        {startingPrice !== null && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-200">
            <Tag className="h-4 w-4 text-emerald-600" />
            From {formatRupees(startingPrice)} / slot
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-200">
          <Clock3 className="h-4 w-4 text-emerald-600" />
          {court.slotDurationMinutes}-minute slots
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-200">
          <MapPin className="h-4 w-4 text-emerald-600" />
          Open {court.operatingHours.length} days a week
        </span>
      </div>

      <HowItWorks />

      <div id="booking" className="scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Book a slot</h2>
        <CourtBooking courtId={court.id} />
      </div>
    </div>
  );
}

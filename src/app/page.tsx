import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getVenueCourt } from "@/lib/venue";
import { multiCourtEnabled } from "@/lib/config";
import { CourtPage } from "@/components/court-page";

const SPORT_LABEL: Record<string, string> = {
  FOOTBALL: "Football",
  CRICKET: "Cricket",
  BADMINTON: "Badminton",
  TENNIS: "Tennis",
  BASKETBALL: "Basketball",
  OTHER: "Sports",
};

export default async function Home() {
  if (multiCourtEnabled) {
    const courts = await prisma.court.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });

    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold text-gray-900">Courts</h1>
        {courts.length === 0 ? (
          <p className="text-sm text-gray-600">No courts have been set up yet. Check back soon.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {courts.map((court) => (
              <Link
                key={court.id}
                href={`/courts/${court.id}`}
                className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-emerald-400 hover:shadow-md"
              >
                <h2 className="text-lg font-medium text-gray-900">{court.name}</h2>
                <p className="text-sm text-gray-500">{SPORT_LABEL[court.sportType] ?? court.sportType}</p>
                {court.description && <p className="mt-2 text-sm text-gray-600">{court.description}</p>}
                <p className="mt-2 text-xs text-gray-400">{court.slotDurationMinutes}-minute slots</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  const court = await getVenueCourt();
  if (!court) {
    return (
      <p className="text-sm text-gray-600">
        The venue hasn&apos;t been set up yet. Run <code>pnpm db:seed</code> to create it.
      </p>
    );
  }

  return <CourtPage court={court} />;
}

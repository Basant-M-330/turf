import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getVenueCourt } from "@/lib/venue";
import { multiCourtEnabled } from "@/lib/config";
import { CourtEditor } from "@/components/court-editor";

export default async function AdminVenuePage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/admin");
  if (multiCourtEnabled) redirect("/admin/courts");

  const court = await getVenueCourt();
  if (!court) {
    return (
      <p className="text-sm text-gray-600">
        No venue is set up yet — run the seed script (<code>pnpm db:seed</code>) to create one.
      </p>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">{court.name}</h1>
      <CourtEditor court={court} />
    </div>
  );
}

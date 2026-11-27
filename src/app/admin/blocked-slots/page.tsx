import { prisma } from "@/lib/prisma";
import { BlockedSlotsManager } from "@/components/blocked-slots-manager";

export default async function AdminBlockedSlotsPage() {
  const courts = await prisma.court.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Blocked slots</h1>
      <BlockedSlotsManager courts={courts} />
    </div>
  );
}

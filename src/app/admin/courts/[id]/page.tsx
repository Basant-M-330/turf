import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { multiCourtEnabled } from "@/lib/config";
import { CourtEditor } from "@/components/court-editor";

export default async function AdminCourtEditPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/admin");
  if (!multiCourtEnabled) redirect("/admin/venue");

  const { id } = await params;
  const court = await prisma.court.findUnique({
    where: { id },
    include: { operatingHours: true, pricingRules: { orderBy: { startTime: "asc" } } },
  });
  if (!court) notFound();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">{court.name}</h1>
      <CourtEditor court={court} />
    </div>
  );
}

import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { multiCourtEnabled } from "@/lib/config";
import { CourtPage } from "@/components/court-page";

export default async function CourtDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!multiCourtEnabled) redirect("/");

  const { id } = await params;
  const court = await prisma.court.findUnique({
    where: { id },
    include: { operatingHours: true, pricingRules: true },
  });
  if (!court || !court.isActive) notFound();

  return <CourtPage court={court} />;
}

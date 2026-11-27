import { prisma } from "@/lib/prisma";

/** This app manages exactly one court/venue — created by the seed script. */
export function getVenueCourt() {
  return prisma.court.findFirst({
    include: { operatingHours: true, pricingRules: { orderBy: { startTime: "asc" } } },
  });
}

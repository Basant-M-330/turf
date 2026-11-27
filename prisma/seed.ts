import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;

async function main() {
  const adminPasswordHash = await bcrypt.hash("admin1234", 10);
  await prisma.user.upsert({
    where: { email: "admin@turf.local" },
    update: {},
    create: {
      name: "Venue Admin",
      email: "admin@turf.local",
      passwordHash: adminPasswordHash,
      role: "ADMIN",
    },
  });

  const staffPasswordHash = await bcrypt.hash("staff1234", 10);
  await prisma.user.upsert({
    where: { email: "staff@turf.local" },
    update: {},
    create: {
      name: "Front Desk",
      email: "staff@turf.local",
      passwordHash: staffPasswordHash,
      role: "STAFF",
    },
  });

  const court = await prisma.court.upsert({
    where: { id: "seed-court" },
    update: {},
    create: {
      id: "seed-court",
      name: "5-a-side Football Turf",
      sportType: "FOOTBALL",
      description: "Synthetic turf, floodlit for evening games.",
      slotDurationMinutes: 60,
      images: ["/dummy/turf-1.svg", "/dummy/turf-2.svg", "/dummy/turf-3.svg"],
    },
  });

  await prisma.operatingHours.deleteMany({ where: { courtId: court.id } });
  await prisma.operatingHours.createMany({
    data: DAYS.map((day) => ({ courtId: court.id, dayOfWeek: day, openTime: "06:00", closeTime: "23:00" })),
  });

  await prisma.pricingRule.deleteMany({ where: { courtId: court.id } });
  await prisma.pricingRule.createMany({
    data: [
      { courtId: court.id, dayType: "WEEKDAY", startTime: "06:00", endTime: "17:00", pricePerSlot: 600 },
      { courtId: court.id, dayType: "WEEKDAY", startTime: "17:00", endTime: "23:00", pricePerSlot: 900 },
      { courtId: court.id, dayType: "WEEKEND", startTime: "06:00", endTime: "23:00", pricePerSlot: 900 },
    ],
  });

  console.log("Seed complete.");
  console.log("Admin login: admin@turf.local / admin1234");
  console.log("Staff login: staff@turf.local / staff1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

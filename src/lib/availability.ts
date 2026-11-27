import { prisma } from "@/lib/prisma";
import { isSlotLocked } from "@/lib/redis";
import type { DayOfWeek, DayType } from "@prisma/client";

const DAY_OF_WEEK_BY_INDEX: DayOfWeek[] = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

export function dayOfWeekForDate(date: string): DayOfWeek {
  const [year, month, day] = date.split("-").map(Number);
  const jsDate = new Date(Date.UTC(year, month - 1, day));
  return DAY_OF_WEEK_BY_INDEX[jsDate.getUTCDay()];
}

export function dayTypeForDate(date: string): DayType {
  const dow = dayOfWeekForDate(date);
  return dow === "SATURDAY" || dow === "SUNDAY" ? "WEEKEND" : "WEEKDAY";
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export type SlotStatus = "AVAILABLE" | "HELD" | "BOOKED" | "BLOCKED";

export interface SlotInfo {
  startTime: string;
  endTime: string;
  price: number;
  status: SlotStatus;
}

/** Marks any HOLD bookings whose 5-minute window has lapsed as EXPIRED so they stop showing as booked. */
export async function expireStaleHolds(courtId: string, date: string) {
  await prisma.booking.updateMany({
    where: {
      courtId,
      date,
      status: "HOLD",
      expiresAt: { lt: new Date() },
    },
    data: { status: "EXPIRED" },
  });
}

export function priceForSlot(
  pricingRules: { dayType: DayType; startTime: string; endTime: string; pricePerSlot: number }[],
  dayType: DayType,
  slotStart: string
): number {
  const slotStartMin = timeToMinutes(slotStart);
  const rule = pricingRules.find(
    (r) =>
      r.dayType === dayType &&
      timeToMinutes(r.startTime) <= slotStartMin &&
      slotStartMin < timeToMinutes(r.endTime)
  );
  return rule?.pricePerSlot ?? 0;
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

/** Lists each unit slot's start time covered by a (possibly multi-hour) booking range. */
export function unitStartTimesInRange(startTime: string, endTime: string, unitMinutes: number): string[] {
  const starts: string[] = [];
  for (let m = timeToMinutes(startTime); m < timeToMinutes(endTime); m += unitMinutes) {
    starts.push(minutesToTime(m));
  }
  return starts;
}

/**
 * Generates every bookable slot for a court on a given date and resolves each one's
 * live status (available / held / booked / blocked).
 */
export async function getSlotsForCourtDate(courtId: string, date: string): Promise<SlotInfo[]> {
  await expireStaleHolds(courtId, date);

  const court = await prisma.court.findUnique({
    where: { id: courtId },
    include: { operatingHours: true, pricingRules: true },
  });
  if (!court) return [];

  const dow = dayOfWeekForDate(date);
  const hours = court.operatingHours.find((h) => h.dayOfWeek === dow);
  if (!hours) return [];

  const dayType = dayTypeForDate(date);
  const duration = court.slotDurationMinutes;
  const openMin = timeToMinutes(hours.openTime);
  const closeMin = timeToMinutes(hours.closeTime);

  const [bookings, blockedSlots] = await Promise.all([
    prisma.booking.findMany({
      where: {
        courtId,
        date,
        status: { in: ["CONFIRMED", "PARTIALLY_PAID", "COMPLETED"] },
      },
    }),
    prisma.blockedSlot.findMany({ where: { courtId, date } }),
  ]);

  const slots: SlotInfo[] = [];
  for (let start = openMin; start + duration <= closeMin; start += duration) {
    const startTime = minutesToTime(start);
    const endTime = minutesToTime(start + duration);
    const end = start + duration;

    // A booking/block can span multiple consecutive slots, so a unit slot is unavailable
    // whenever it overlaps one at all — not just when its start time matches exactly.
    const isBooked = bookings.some((b) =>
      rangesOverlap(start, end, timeToMinutes(b.startTime), timeToMinutes(b.endTime))
    );
    const isBlocked = blockedSlots.some((b) =>
      rangesOverlap(start, end, timeToMinutes(b.startTime), timeToMinutes(b.endTime))
    );
    const isHeld = !isBooked && !isBlocked && (await isSlotLocked(courtId, date, startTime));

    let status: SlotStatus = "AVAILABLE";
    if (isBooked) status = "BOOKED";
    else if (isBlocked) status = "BLOCKED";
    else if (isHeld) status = "HELD";

    slots.push({
      startTime,
      endTime,
      price: priceForSlot(court.pricingRules, dayType, startTime),
      status,
    });
  }

  return slots;
}

import { z } from "zod";

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
export const timeSchema = z.string().regex(/^\d{2}:\d{2}$/, "Expected HH:MM");

export const MAX_DURATION_SLOTS = 8;

export const holdSlotSchema = z.object({
  courtId: z.string().min(1),
  date: dateSchema,
  startTime: timeSchema,
  durationSlots: z.number().int().min(1).max(MAX_DURATION_SLOTS).default(1),
});

export const createPaymentOrderSchema = z.object({
  paymentType: z.enum(["FULL", "PARTIAL"]),
});

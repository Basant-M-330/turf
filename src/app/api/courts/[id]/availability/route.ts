import { NextResponse } from "next/server";
import { getSlotsForCourtDate } from "@/lib/availability";
import { dateSchema } from "@/lib/validations/booking";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const date = new URL(req.url).searchParams.get("date") ?? "";
  const parsed = dateSchema.safeParse(date);
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid 'date' (YYYY-MM-DD) query param is required" }, { status: 400 });
  }

  const slots = await getSlotsForCourtDate(id, date);
  return NextResponse.json({ date, slots });
}

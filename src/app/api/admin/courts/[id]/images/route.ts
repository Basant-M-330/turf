import { NextResponse } from "next/server";
import { z } from "zod";
import { fileTypeFromBuffer } from "file-type";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/permissions";
import { uploadImage, deleteImage } from "@/lib/storage";

// Keyed by the actual sniffed file signature (not the client-supplied, spoofable MIME header).
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const court = await prisma.court.findUnique({ where: { id } });
  if (!court) {
    return NextResponse.json({ error: "Court not found" }, { status: 404 });
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "Image must be 5MB or smaller" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const sniffed = await fileTypeFromBuffer(buffer);
  const extension = sniffed ? ALLOWED_TYPES[sniffed.mime] : undefined;
  if (!extension) {
    return NextResponse.json({ error: "Only JPEG, PNG, or WebP images are allowed" }, { status: 400 });
  }

  const publicPath = await uploadImage(buffer, extension);
  const updated = await prisma.court.update({
    where: { id },
    data: { images: { push: publicPath } },
  });

  return NextResponse.json({ images: updated.images });
}

const deleteSchema = z.object({ path: z.string().min(1) });

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A 'path' is required" }, { status: 400 });
  }

  const court = await prisma.court.findUnique({ where: { id } });
  if (!court) {
    return NextResponse.json({ error: "Court not found" }, { status: 404 });
  }

  const nextImages = court.images.filter((img) => img !== parsed.data.path);
  const updated = await prisma.court.update({ where: { id }, data: { images: nextImages } });
  await deleteImage(parsed.data.path);

  return NextResponse.json({ images: updated.images });
}

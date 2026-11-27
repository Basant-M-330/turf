import { writeFile, unlink } from "fs/promises";
import path from "path";
import { put, del } from "@vercel/blob";

const LOCAL_UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

/**
 * Vercel's serverless functions have a read-only, ephemeral filesystem — writing to
 * `public/uploads` (as a local Docker deployment does) silently doesn't work there. When
 * `BLOB_READ_WRITE_TOKEN` is set (any real Vercel deployment), uploads go to Vercel Blob
 * instead; without it (local dev), they fall back to local disk exactly as before.
 */
const useBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

export async function uploadImage(buffer: Buffer, extension: string): Promise<string> {
  const filename = `${crypto.randomUUID()}.${extension}`;

  if (useBlob) {
    const blob = await put(`uploads/${filename}`, buffer, { access: "public" });
    return blob.url;
  }

  await writeFile(path.join(LOCAL_UPLOADS_DIR, filename), buffer);
  return `/uploads/${filename}`;
}

export async function deleteImage(imagePath: string): Promise<void> {
  if (useBlob && imagePath.startsWith("http")) {
    await del(imagePath).catch(() => {});
    return;
  }

  if (imagePath.startsWith("/uploads/")) {
    await unlink(path.join(LOCAL_UPLOADS_DIR, path.basename(imagePath))).catch(() => {});
  }
}

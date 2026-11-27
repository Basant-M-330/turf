"use client";

import { useRef, useState } from "react";

export function ImageManager({ courtId, initialImages }: { courtId: string; initialImages: string[] }) {
  const [images, setImages] = useState(initialImages);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`/api/admin/courts/${courtId}/images`, { method: "POST", body: formData });
    const data = await res.json();
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    if (!res.ok) {
      setError(data.error ?? "Could not upload image");
      return;
    }
    setImages(data.images);
  }

  async function removeImage(imagePath: string) {
    const res = await fetch(`/api/admin/courts/${courtId}/images`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: imagePath }),
    });
    const data = await res.json();
    if (res.ok) setImages(data.images);
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {images.map((img) => (
          <div key={img} className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img} alt="Venue" className="h-full w-full object-cover" />
            <button
              onClick={() => removeImage(img)}
              className="absolute right-1.5 top-1.5 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white opacity-0 transition group-hover:opacity-100"
            >
              Remove
            </button>
          </div>
        ))}
        <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-500 hover:border-emerald-500 hover:text-emerald-600">
          {uploading ? "Uploading..." : "+ Add photo"}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onFileChange}
            disabled={uploading}
            className="hidden"
          />
        </label>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <p className="mt-2 text-xs text-gray-500">JPEG, PNG, or WebP, up to 5MB.</p>
    </div>
  );
}

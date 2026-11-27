"use client";

import { useState } from "react";
import { ArrowDown } from "lucide-react";

export function Hero({
  images,
  name,
  sportLabel,
  description,
}: {
  images: string[];
  name: string;
  sportLabel: string;
  description: string | null;
}) {
  const [active, setActive] = useState(0);
  const hasImages = images.length > 0;

  return (
    <div className="relative overflow-hidden rounded-3xl shadow-lg">
      <div className="relative aspect-[16/10] w-full sm:aspect-[16/7]">
        {hasImages ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={images[active]} alt={name} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-emerald-700 via-emerald-800 to-gray-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />

        <div className="absolute inset-x-0 bottom-0 p-6 sm:p-10">
          <span className="inline-flex items-center rounded-full bg-amber-400 px-3 py-1 text-xs font-bold uppercase tracking-wide text-gray-900">
            {sportLabel}
          </span>
          <h1 className="mt-3 max-w-xl text-3xl font-extrabold tracking-tight text-white drop-shadow-sm sm:text-5xl">
            {name}
          </h1>
          {description && (
            <p className="mt-2 max-w-md text-sm text-white/85 sm:text-base">{description}</p>
          )}
          <a
            href="#booking"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-400"
          >
            Book a slot
            <ArrowDown className="h-4 w-4" />
          </a>
        </div>

        {images.length > 1 && (
          <div className="absolute right-4 top-4 flex gap-2 sm:right-6 sm:top-6">
            {images.map((img, i) => (
              <button
                key={img}
                onClick={() => setActive(i)}
                aria-label={`Show photo ${i + 1}`}
                className={`h-12 w-16 overflow-hidden rounded-lg border-2 transition sm:h-14 sm:w-20 ${
                  i === active ? "border-amber-400" : "border-white/50 opacity-70 hover:opacity-100"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

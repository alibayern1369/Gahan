"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";

interface AdminSelfieImageProps {
  path: string;
  label: string;
  className?: string;
  showLabel?: boolean;
}

/** Loads a private selfie through the authenticated admin proxy route. */
export function AdminSelfieImage({
  path,
  label,
  className = "h-40 w-32 rounded-2xl object-cover ring-1 ring-black/10 dark:ring-white/10",
  showLabel = true,
}: AdminSelfieImageProps) {
  const [failed, setFailed] = useState(false);
  const src = `/api/admin/selfie?path=${encodeURIComponent(path)}`;

  if (failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 rounded-2xl bg-black/5 text-center dark:bg-white/5 ${showLabel ? "h-40 w-32" : "size-9"}`}
      >
        <Badge tone="neutral">{showLabel ? "بارگذاری نشد" : "—"}</Badge>
        {showLabel ? <span className="text-[10px] text-faint">{label}</span> : null}
      </div>
    );
  }

  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={label}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={className}
    />
  );

  if (!showLabel) return img;

  return (
    <figure>
      {img}
      <figcaption className="mt-1 text-center text-[10px] text-faint">{label}</figcaption>
    </figure>
  );
}

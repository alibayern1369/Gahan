import type { MetadataRoute } from "next";
import { brandingPublicUrl, getSettings } from "@/lib/settings-server";

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const s = await getSettings();
  const pwaIcon = brandingPublicUrl(s.pwa_icon_path);
  const fallback = "/icon.svg";

  return {
    name: `${s.application_name} — ${s.tagline}`,
    short_name: s.application_name,
    description: s.tagline,
    id: "/",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    dir: "rtl",
    lang: "fa",
    background_color: "#0b0f1a",
    theme_color: s.theme_color,
    categories: ["productivity", "business"],
    icons: pwaIcon
      ? [
          { src: pwaIcon, sizes: "192x192", type: "image/png", purpose: "any" },
          { src: pwaIcon, sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: fallback, sizes: "any", type: "image/svg+xml" },
        ]
      : [{ src: fallback, sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}

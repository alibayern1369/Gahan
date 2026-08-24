import "server-only";
import { brandingPublicUrl, getSettings } from "@/lib/settings-server";

/**
 * Brand-aware wordmark. Renders the configured light/dark logo when available,
 * otherwise falls back to the polished گاهان text wordmark.
 * Theme switching is pure CSS (no flash, no hydration cost).
 */
export async function BrandMark({
  size = "md",
  showTagline = false,
}: {
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
}) {
  const settings = await getSettings();
  const lightUrl = brandingPublicUrl(settings.logo_light_path);
  const darkUrl = brandingPublicUrl(settings.logo_dark_path);

  const heights = { sm: "h-7", md: "h-9", lg: "h-14" } as const;

  // Custom logo present → images; else wordmark
  if (lightUrl || darkUrl) {
    return (
      <span className="inline-flex flex-col items-start">
        <span className={`inline-flex items-center gap-2 ${heights[size]}`}>
          {/* Light-mode logo */}
          {lightUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={lightUrl} alt={settings.application_name} className={`${heights[size]} w-auto object-contain dark:hidden`} />
          ) : (
            <Wordmark size={size} />
          )}
          {/* Dark-mode logo */}
          {darkUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={darkUrl} alt={settings.application_name} className={`${heights[size]} hidden w-auto object-contain dark:block`} />
          ) : lightUrl ? (
            // fall back to light logo in dark mode when no dark variant exists
            // eslint-disable-next-line @next/next/no-img-element
            <img src={lightUrl} alt="" aria-hidden className={`${heights[size]} hidden w-auto object-contain dark:block`} />
          ) : null}
        </span>
        {showTagline ? <span className="mt-1 text-[10px] font-medium text-faint">{settings.tagline}</span> : null}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col items-start">
      <Wordmark size={size} />
      {showTagline ? <span className="mt-1 text-[10px] font-medium text-faint">{settings.tagline}</span> : null}
    </span>
  );
}

function Wordmark({ size }: { size: "sm" | "md" | "lg" }) {
  const sizes = { sm: "text-xl", md: "text-3xl", lg: "text-5xl" } as const;
  const dotSizes = { sm: "size-1.5", md: "size-2", lg: "size-3" } as const;
  return (
    <span className="inline-flex select-none items-baseline gap-1">
      <span className={`bg-gradient-to-l from-brand-700 via-brand-500 to-brand-400 bg-clip-text font-black tracking-tight text-transparent ${sizes[size]} leading-none`}>
        گاهان
      </span>
      <span className={`${dotSizes[size]} rounded-full bg-mint-500`} aria-hidden />
    </span>
  );
}

export function OrgName({ className = "" }: { className?: string }) {
  return <OrgNameInner className={className} />;
}

async function OrgNameInner({ className }: { className: string }) {
  const settings = await getSettings();
  return <span className={className}>{settings.organization_name}</span>;
}

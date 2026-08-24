import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/ui/toast";
import { brandingPublicUrl, getSettings } from "@/lib/settings-server";
import "vazirmatn/Vazirmatn-font-face.css";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  const favicon = brandingPublicUrl(settings.favicon_path);
  const pwaIcon = brandingPublicUrl(settings.pwa_icon_path);

  return {
    title: {
      default: `${settings.application_name} | ${settings.tagline}`,
      template: `%s | ${settings.application_name}`,
    },
    description: `${settings.application_name} — ${settings.tagline}`,
    applicationName: settings.application_name,
    icons: {
      icon: favicon ?? "/icon.svg",
      apple: pwaIcon ?? favicon ?? "/icon.svg",
    },
    manifest: "/manifest.webmanifest",
    formatDetection: { telephone: false },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const settings = await getSettings();
  return {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: "cover",
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: "#f2f4fa" },
      { media: "(prefers-color-scheme: dark)", color: settings.theme_color },
    ],
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}`,
          }}
        />
      </body>
    </html>
  );
}

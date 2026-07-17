import type { Metadata, Viewport } from "next";
import { Oswald, Inter } from "next/font/google";
import { headers } from "next/headers";
import { getCurrentRestaurant } from "@/lib/restaurant";
import { themeCssBlock } from "@/lib/color";
import { getDisplayFont, getBodyFont } from "@/lib/fonts";
import { CookieNotice } from "@/components/cookie-notice";
import "./globals.css";

const oswald = Oswald({
  subsets: ["latin"],
  variable: "--font-oswald",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const restaurant = await getCurrentRestaurant();
  const title = restaurant ? restaurant.name : "LunchPad";
  const description = restaurant
    ? `Order lunch from ${restaurant.name} — powered by LunchPad.`
    : "LunchPad — lunch ordering software built for operators. Schools, offices, anywhere lunch is delivered daily.";

  return {
    title: restaurant
      ? { default: restaurant.name, template: `%s | ${restaurant.name}` }
      : { default: "LunchPad", template: "%s | LunchPad" },
    description,
    icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }] },
    // Open Graph (link previews in iMessage, WhatsApp, Slack, etc.)
    // For the platform landing (no restaurant), force LunchPad branding so the
    // share preview is never the most-recently-loaded restaurant's logo.
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "LunchPad",
      // Next.js auto-resolves /opengraph-image.png from app/ — explicit URL avoids
      // any ambiguity about which image to use for restaurant vs platform context.
      images: restaurant
        ? undefined  // each restaurant page can opt into its own og:image later
        : [{ url: "/opengraph-image.png", width: 1200, height: 630, alt: "LunchPad — built for lunch operators." }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: restaurant ? undefined : ["/twitter-image.png"],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#2C4031",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const restaurant = await getCurrentRestaurant();

  // Treat legacy default colors as "not customized" — fall through to editorial defaults
  const isColorCustomized = (color: string | null | undefined, legacyDefault: string): boolean =>
    Boolean(color && color !== legacyDefault);

  const primaryColor = isColorCustomized(restaurant?.primaryColor, "#c41230") ? restaurant?.primaryColor : undefined;
  const accentColor = isColorCustomized(restaurant?.accentColor, "#f59e0b") ? restaurant?.accentColor : undefined;
  const darkColor = isColorCustomized(restaurant?.darkColor, "#1c0505") ? restaurant?.darkColor : undefined;
  const displayFont = isColorCustomized(restaurant?.displayFont, "Oswald") ? restaurant?.displayFont : undefined;

  const displayFontObj = displayFont ? getDisplayFont(displayFont) : getDisplayFont("Fraunces");
  const bodyFont    = getBodyFont(restaurant?.bodyFont);
  const cssBlock = themeCssBlock({
    primaryColor,
    accentColor,
    darkColor,
    heroTitleColor:  restaurant?.heroTitleColor,
    heroAccentColor: restaurant?.heroAccentColor,
    bodyTextColor:   restaurant?.bodyTextColor,
    displayFont,
    bodyFont:        restaurant?.bodyFont,
  });
  // Tag the document so CSS can branch between three layouts on desktop:
  //   is-platform — apex marketing pages (full width)
  //   is-admin    — /admin/* pages on a tenant subdomain (full width)
  //   is-tenant   — customer-facing pages on a tenant subdomain
  //                 (centered phone-card)
  //
  // Middleware sets x-pathname so we can read the current route at the
  // root layout without re-resolving it. Falls back to platform when no
  // restaurant context resolved (apex / unknown host).
  const headerList = await headers();
  const pathname = headerList.get("x-pathname") ?? "";
  const isAdminPath = pathname.startsWith("/admin");
  let shellMode: "is-platform" | "is-tenant" | "is-admin";
  if (isAdminPath) {
    shellMode = "is-admin";
  } else if (!restaurant) {
    shellMode = "is-platform";
  } else {
    shellMode = "is-tenant";
  }
  return (
    <html lang="en" className={`${oswald.variable} ${inter.variable} ${shellMode}`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href={displayFontObj.googleUrl} rel="stylesheet" />
        {bodyFont.id !== displayFontObj.id && (
          <link href={bodyFont.googleUrl} rel="stylesheet" />
        )}
        <style dangerouslySetInnerHTML={{ __html: cssBlock }} />
      </head>
      <body>
        <div className="app-shell">
          {children}
        </div>
        <CookieNotice />
      </body>
    </html>
  );
}

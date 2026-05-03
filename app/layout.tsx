import type { Metadata, Viewport } from "next";
import { Oswald, Inter } from "next/font/google";
import { getCurrentRestaurant } from "@/lib/restaurant";
import { themeCssBlock } from "@/lib/color";
import { getDisplayFont, getBodyFont } from "@/lib/fonts";
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
  return {
    title: restaurant
      ? { default: restaurant.name, template: `%s | ${restaurant.name}` }
      : { default: "LunchPad", template: "%s | LunchPad" },
    description: restaurant
      ? `Order lunch from ${restaurant.name} — powered by LunchPad.`
      : "LunchPad — school lunch ordering made simple for restaurants and parents.",
    icons: {
      icon: [
        { url: "/favicon.svg", type: "image/svg+xml" },
        { url: "/icon.png" },
      ],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#c41230",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const restaurant = await getCurrentRestaurant();
  const displayFont = getDisplayFont(restaurant?.displayFont);
  const bodyFont    = getBodyFont(restaurant?.bodyFont);
  const cssBlock = themeCssBlock({
    primaryColor:    restaurant?.primaryColor,
    accentColor:     restaurant?.accentColor,
    darkColor:       restaurant?.darkColor,
    heroTitleColor:  restaurant?.heroTitleColor,
    heroAccentColor: restaurant?.heroAccentColor,
    bodyTextColor:   restaurant?.bodyTextColor,
    displayFont:     restaurant?.displayFont,
    bodyFont:        restaurant?.bodyFont,
  });
  return (
    <html lang="en" className={`${oswald.variable} ${inter.variable}`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href={displayFont.googleUrl} rel="stylesheet" />
        {bodyFont.id !== displayFont.id && (
          <link href={bodyFont.googleUrl} rel="stylesheet" />
        )}
        <style dangerouslySetInnerHTML={{ __html: cssBlock }} />
      </head>
      <body>
        <div className="app-shell">
          {children}
        </div>
      </body>
    </html>
  );
}

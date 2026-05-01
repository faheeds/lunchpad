import type { Metadata, Viewport } from "next";
import { Oswald, Inter } from "next/font/google";
import { getCurrentRestaurant } from "@/lib/restaurant";
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
  const name = restaurant?.name ?? "Hot Lunch";
  return {
    title: `${name} | Hot Lunch`,
    description: `Order hot lunch from ${name}.`,
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#c41230",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${oswald.variable} ${inter.variable}`}>
      <body>
        <div className="app-shell">
          {children}
        </div>
      </body>
    </html>
  );
}

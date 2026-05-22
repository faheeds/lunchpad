import { SiteHeaderServer } from "@/components/site-header-server";
import { SiteFooter } from "@/components/site-footer";
import { AppNav } from "@/components/app-nav";
import { getCurrentRestaurant } from "@/lib/restaurant";
import { ContactForm } from "./contact-form";

export const dynamic = "force-dynamic";

export default async function ContactPage() {
  const restaurant = await getCurrentRestaurant();
  // Fallback to the platform name when /contact is hit on the apex (no
  // tenant context). Was hardcoded to "Hot Lunch" (the original tenant's
  // brand) before LunchPad went multi-tenant.
  const restaurantName = restaurant?.name ?? "LunchPad";

  return (
    <>
      <SiteHeaderServer />
      <main className="app-content">
        {/* Header */}
        <div style={{
          background: "linear-gradient(135deg, var(--dark-bg) 0%, color-mix(in srgb, var(--dark-bg) 80%, #000) 100%)",
          padding: "28px 20px 28px",
          boxShadow: "0 4px 16px -8px rgba(0,0,0,0.25)",
        }}>
          <p style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.22em",
            textTransform: "uppercase", color: "var(--accent-on-dark)", marginBottom: 6,
          }}>
            ★ {restaurantName} ★
          </p>
          <h1 style={{
            fontSize: 26, fontWeight: 800, color: "var(--hero-title)",
            textTransform: "uppercase", letterSpacing: "0.02em",
            lineHeight: 1.1, marginBottom: 8,
          }}>
            Contact Us
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.55 }}>
            Questions about an order or general feedback? We&apos;d love to hear from you.
          </p>
        </div>

        <ContactForm />

        <SiteFooter />
      </main>
      <AppNav />
    </>
  );
}

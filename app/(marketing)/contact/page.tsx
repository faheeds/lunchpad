import { SiteHeader } from "@/components/site-header";
import { AppNav } from "@/components/app-nav";
import { getCurrentRestaurant } from "@/lib/restaurant";
import { ContactForm } from "./contact-form";

export const dynamic = "force-dynamic";

export default async function ContactPage() {
  const restaurant = await getCurrentRestaurant();
  const restaurantName = restaurant?.name ?? "Hot Lunch";

  return (
    <>
      <SiteHeader />
      <main className="app-content">
        {/* Header */}
        <div style={{
          background: "linear-gradient(135deg, #1c0505 0%, #3b0a0a 100%)",
          padding: "28px 20px 24px",
        }}>
          <p style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.22em",
            textTransform: "uppercase", color: "#f59e0b", marginBottom: 6,
          }}>
            ★ {restaurantName} ★
          </p>
          <h1 style={{
            fontSize: 26, fontWeight: 800, color: "white",
            textTransform: "uppercase", letterSpacing: "0.02em",
            lineHeight: 1.1, marginBottom: 8,
          }}>
            Contact Us
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.55 }}>
            Questions about an order or general feedback? We&apos;d love to hear from you.
          </p>
        </div>

        <ContactForm />
      </main>
      <AppNav />
    </>
  );
}

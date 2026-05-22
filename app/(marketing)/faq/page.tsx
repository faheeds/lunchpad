import { SiteHeaderServer } from "@/components/site-header-server";
import { AppNav } from "@/components/app-nav";
import { getCurrentRestaurant } from "@/lib/restaurant";
import { FAQAccordion } from "@/components/faq-accordion";

export const dynamic = "force-dynamic";

export default async function FAQPage() {
  const restaurant = await getCurrentRestaurant();
  const restaurantName = restaurant?.name ?? "LunchPad";

  return (
    <>
      <SiteHeaderServer />
      <main className="app-content" id="main-content">
        {/* Header */}
        <div
          style={{
            background: "linear-gradient(135deg, #2C4031 0%, #1E2C22 100%)",
            padding: "28px 20px 28px",
            boxShadow: "0 4px 16px -8px rgba(0,0,0,0.25)",
          }}
        >
          <p
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "#DEE2CF",
              marginBottom: 6,
            }}
          >
            ★ {restaurantName} ★
          </p>
          <h1
            style={{
              fontSize: 26,
              fontWeight: 800,
              color: "#F6F1E6",
              textTransform: "uppercase",
              letterSpacing: "0.02em",
              lineHeight: 1.1,
              marginBottom: 8,
            }}
          >
            Frequently Asked Questions
          </h1>
          <p style={{ fontSize: 13, color: "rgba(246, 241, 230, 0.75)", lineHeight: 1.55 }}>
            Find answers to common questions about ordering, payments, and delivery.
          </p>
        </div>

        {/* Content */}
        <div style={{ padding: "20px 16px 100px" }}>
          <div
            style={{
              maxWidth: 720,
              margin: "0 auto",
            }}
          >
            <FAQAccordion />
          </div>
        </div>
      </main>
      <AppNav />
    </>
  );
}

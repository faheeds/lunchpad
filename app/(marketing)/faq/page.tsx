import { SiteHeaderServer } from "@/components/site-header-server";
import { AppNav } from "@/components/app-nav";
import { getCurrentRestaurant } from "@/lib/restaurant";
import { FAQSection } from "./faq-section";

export const dynamic = "force-dynamic";

interface FAQItem {
  question: string;
  answer: string;
}

const FAQS: FAQItem[] = [
  {
    question: "How do I place an order?",
    answer: "Go to the Menu page to see available items and delivery dates. Select items, choose any additions or removals, then proceed to checkout. You'll receive a confirmation email immediately."
  },
  {
    question: "Can I cancel an order?",
    answer: "Yes! You can cancel orders before the cutoff time in your Order History. After the cutoff, contact us for assistance with your cancellation."
  },
  {
    question: "What is the ordering cutoff time?",
    answer: "Cutoff times vary by school and delivery date. Check the delivery date calendar for specific times. We send reminders 24 hours before cutoff."
  },
  {
    question: "How will I receive my order?",
    answer: "Orders are delivered on the scheduled delivery date to your school. Your child will receive the meal during lunch or as scheduled."
  },
  {
    question: "What payment methods do you accept?",
    answer: "We accept all major credit and debit cards including Visa, Mastercard, and American Express. Payments are processed securely through Stripe."
  },
  {
    question: "Can I modify my order after placing it?",
    answer: "Yes, you can modify your order before the cutoff time. Go to Order History, find the order, and click Edit. Changes are subject to item availability."
  },
];

export default async function FAQPage() {
  const restaurant = await getCurrentRestaurant();
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
            Frequently Asked Questions
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.55 }}>
            Find answers to common questions about ordering, delivery, payments, and more.
          </p>
        </div>

        <FAQSection faqs={FAQS} />
      </main>
      <AppNav />
    </>
  );
}

export type PricingPlan = {
  name: string;
  price: string;
  pop: boolean;
  desc: string;
  feats: string[];
};

export const PRICING: PricingPlan[] = [
  {
    name: "Starter", price: "49", pop: false,
    desc: "Perfect for a couple of locations just getting started.",
    feats: ["Up to 2 locations", "750 orders / month", "Stripe payouts", "Email confirmations", "Order dashboard"],
  },
  {
    name: "Growth", price: "99", pop: true,
    desc: "For growing operators serving multiple locations.",
    feats: ["Up to 5 locations", "2,000 orders / month", "Weekly batch checkout", "Priority support", "Everything in Starter"],
  },
  {
    name: "Scale", price: "199", pop: false,
    desc: "For large districts and multi-brand operators.",
    feats: ["Up to 10 locations", "Unlimited orders", "Custom branding", "Dedicated onboarding", "Everything in Growth"],
  },
];

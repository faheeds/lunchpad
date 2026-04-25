import Stripe from "stripe";
import { env } from "@/lib/env";

export const stripe =
  env.STRIPE_SECRET_KEY && env.STRIPE_SECRET_KEY.startsWith("sk_")
    ? new Stripe(env.STRIPE_SECRET_KEY, {
        apiVersion: "2025-08-27.basil"
      })
    : null;

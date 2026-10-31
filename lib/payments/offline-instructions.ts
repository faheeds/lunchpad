import { formatCurrency } from "@/lib/utils";

export type PaymentInstructionsInput = {
  method: string; // "cash" | "zelle" | ...
  totalCents: number;
  zelleHandle?: string | null;
  instructions?: string | null;
};

/** Plain-language "how to pay" lines, shared by the checkout screen and the email. */
export function buildPaymentInstructionLines(input: PaymentInstructionsInput): string[] {
  const amount = formatCurrency(input.totalCents);
  const lines: string[] = [];
  if (input.method === "zelle") {
    lines.push(
      input.zelleHandle
        ? `Please send ${amount} via Zelle to ${input.zelleHandle}.`
        : `Please send ${amount} via Zelle. The restaurant will share the details with you.`,
    );
    lines.push("Include your order number in the Zelle memo so we can match it.");
  } else if (input.method === "cash") {
    lines.push(`Please pay ${amount} in cash when you pick up or receive your order.`);
  } else {
    lines.push(`Please pay ${amount} directly to the restaurant (${input.method}).`);
  }
  if (input.instructions?.trim()) lines.push(input.instructions.trim());
  return lines;
}

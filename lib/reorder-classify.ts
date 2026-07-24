export type ReorderMissingReason = "not_on_menu" | "needs_selection";

/**
 * Returns why a reorder candidate couldn't be auto-cloned into the cart.
 * Returns null when the item can be cloned without any user intervention.
 *
 * "not_on_menu"     — item isn't on the target date's menu at all
 * "needs_selection" — item is on the menu but requires a choice or size
 *                     that the original order didn't capture
 */
export function classifyReorderItem(args: {
  available: boolean;
  requiredChoices: string[];
  capturedChoice: string | undefined;
  hasSizes: boolean;
  capturedSize: string | null | undefined;
}): ReorderMissingReason | null {
  if (!args.available) return "not_on_menu";
  if (args.requiredChoices.length > 0 && !args.capturedChoice) return "needs_selection";
  if (args.hasSizes && !args.capturedSize) return "needs_selection";
  return null;
}

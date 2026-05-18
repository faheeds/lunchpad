export const SAMPLE_SCHOOL_NAME = "[Sample] Elementary";

export const SAMPLE_MENU_ITEMS = [
  { name: "[Sample] Caesar Salad", price: 750 },
  { name: "[Sample] Turkey Wrap", price: 850 },
  { name: "[Sample] Cheese Pizza", price: 950 },
  { name: "[Sample] Fruit Cup", price: 450 },
  { name: "[Sample] Bottled Water", price: 250 },
] as const;

export function isSampleData(name: string): boolean {
  return name.startsWith("[Sample]");
}

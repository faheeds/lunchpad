export const REQUIRED_CHOICES_BY_SLUG: Record<string, string[]> = {
  "build-your-own-burger": [
    "Beef",
    "Crispy Chicken",
    "Grilled Chicken",
    "Beyond Vegan Meat"
  ],
  "gourmet-burgers": [
    "Bacon Cheddar",
    "Jalapeno Sriracha",
    "Hawaiian (Pineapple) Burger",
    "Western (no veggies)",
    "Shroom n Onions"
  ],
  "chicken-wings-4pc": ["BBQ", "Spicy BBQ", "Buffalo", "Lemon Pepper"]
};

export function getRequiredChoicesForMenuItem(slug: string) {
  return REQUIRED_CHOICES_BY_SLUG[slug] ?? [];
}

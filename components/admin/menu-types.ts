export interface MenuManagerOption {
  id: string;
  name: string;
  optionType: "ADD_ON" | "REMOVAL";
  priceDeltaCents: number;
}

export interface MenuManagerItem {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  basePriceCents: number;
  isActive: boolean;
  isUpsell: boolean;
  featuredOnLanding: boolean;
  dietaryTags: string[];
  category: string | null;
  requiredChoices: string[];
  sizes: { name: string; priceCents: number }[];
  options: MenuManagerOption[];
  schoolIds: string[];
}

export interface MenuManagerSchool {
  id: string;
  name: string;
  locationType: "SCHOOL" | "OFFICE";
}

export type SaveMenuItemResult = { ok: true; id: string } | { ok: false; error: string };

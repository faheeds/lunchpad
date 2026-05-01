export interface Theme {
  id: string;
  name: string;
  dark: string;
  primary: string;
  accent: string;
}

export const THEMES: Theme[] = [
  { id: "crimson",  name: "Crimson Classic", dark: "#1c0505", primary: "#c41230", accent: "#f59e0b" },
  { id: "ocean",    name: "Ocean Night",     dark: "#0a1628", primary: "#1d4ed8", accent: "#06b6d4" },
  { id: "forest",   name: "Forest Deep",     dark: "#0a1a0a", primary: "#15803d", accent: "#facc15" },
  { id: "royal",    name: "Royal Purple",    dark: "#1a0a2e", primary: "#7c3aed", accent: "#f472b6" },
  { id: "ember",    name: "Sunset Ember",    dark: "#1c0a05", primary: "#c2410c", accent: "#fbbf24" },
  { id: "midnight", name: "Midnight",        dark: "#0f172a", primary: "#4f46e5", accent: "#38bdf8" },
  { id: "rose",     name: "Rose Noir",       dark: "#1a0510", primary: "#be185d", accent: "#fde68a" },
  { id: "espresso", name: "Espresso Gold",   dark: "#1c1005", primary: "#92400e", accent: "#fcd34d" },
];

export function getTheme(id: string): Theme | undefined {
  return THEMES.find((t) => t.id === id);
}

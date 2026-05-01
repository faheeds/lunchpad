export interface FontOption {
  id: string;
  name: string;
  family: string;           // CSS font-family value
  googleUrl: string;        // Google Fonts preload URL
}

export const DISPLAY_FONTS: FontOption[] = [
  { id: "Oswald",           name: "Oswald",          family: "'Oswald', sans-serif",          googleUrl: "https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&display=swap" },
  { id: "Bebas Neue",       name: "Bebas Neue",       family: "'Bebas Neue', sans-serif",       googleUrl: "https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap" },
  { id: "Montserrat",       name: "Montserrat",       family: "'Montserrat', sans-serif",       googleUrl: "https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&display=swap" },
  { id: "Playfair Display", name: "Playfair Display", family: "'Playfair Display', serif",      googleUrl: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800&display=swap" },
  { id: "Raleway",          name: "Raleway",          family: "'Raleway', sans-serif",          googleUrl: "https://fonts.googleapis.com/css2?family=Raleway:wght@600;700;800&display=swap" },
];

export const BODY_FONTS: FontOption[] = [
  { id: "Inter",       name: "Inter",        family: "'Inter', sans-serif",        googleUrl: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" },
  { id: "Poppins",     name: "Poppins",      family: "'Poppins', sans-serif",      googleUrl: "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap" },
  { id: "Open Sans",   name: "Open Sans",    family: "'Open Sans', sans-serif",    googleUrl: "https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap" },
  { id: "Lato",        name: "Lato",         family: "'Lato', sans-serif",         googleUrl: "https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap" },
];

export function getDisplayFont(id?: string | null): FontOption {
  return DISPLAY_FONTS.find((f) => f.id === id) ?? DISPLAY_FONTS[0];
}

export function getBodyFont(id?: string | null): FontOption {
  return BODY_FONTS.find((f) => f.id === id) ?? BODY_FONTS[0];
}

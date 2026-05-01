export interface FontOption {
  id:        string;
  name:      string;
  family:    string;
  googleUrl: string;
}

export const DISPLAY_FONTS: FontOption[] = [
  {
    id: "Oswald", name: "Oswald", family: "'Oswald', sans-serif",
    googleUrl: "https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&display=swap",
  },
  {
    id: "Bebas Neue", name: "Bebas Neue", family: "'Bebas Neue', sans-serif",
    googleUrl: "https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap",
  },
  {
    id: "Anton", name: "Anton", family: "'Anton', sans-serif",
    googleUrl: "https://fonts.googleapis.com/css2?family=Anton&display=swap",
  },
  {
    id: "Barlow Condensed", name: "Barlow Condensed", family: "'Barlow Condensed', sans-serif",
    googleUrl: "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800&display=swap",
  },
  {
    id: "Fjalla One", name: "Fjalla One", family: "'Fjalla One', sans-serif",
    googleUrl: "https://fonts.googleapis.com/css2?family=Fjalla+One&display=swap",
  },
  {
    id: "Roboto Condensed", name: "Roboto Condensed", family: "'Roboto Condensed', sans-serif",
    googleUrl: "https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@400;700&display=swap",
  },
  {
    id: "Montserrat", name: "Montserrat", family: "'Montserrat', sans-serif",
    googleUrl: "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap",
  },
  {
    id: "Raleway", name: "Raleway", family: "'Raleway', sans-serif",
    googleUrl: "https://fonts.googleapis.com/css2?family=Raleway:wght@400;600;700;800&display=swap",
  },
  {
    id: "Playfair Display", name: "Playfair Display", family: "'Playfair Display', serif",
    googleUrl: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&display=swap",
  },
  {
    id: "Urbanist", name: "Urbanist", family: "'Urbanist', sans-serif",
    googleUrl: "https://fonts.googleapis.com/css2?family=Urbanist:wght@400;600;700;800&display=swap",
  },
  {
    id: "Exo 2", name: "Exo 2", family: "'Exo 2', sans-serif",
    googleUrl: "https://fonts.googleapis.com/css2?family=Exo+2:wght@400;600;700;800&display=swap",
  },
  {
    id: "Nunito", name: "Nunito", family: "'Nunito', sans-serif",
    googleUrl: "https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap",
  },
  {
    id: "DM Sans", name: "DM Sans (Display)", family: "'DM Sans', sans-serif",
    googleUrl: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&display=swap",
  },
  {
    id: "Kanit", name: "Kanit", family: "'Kanit', sans-serif",
    googleUrl: "https://fonts.googleapis.com/css2?family=Kanit:wght@400;600;700;800&display=swap",
  },
  {
    id: "Poppins", name: "Poppins (Display)", family: "'Poppins', sans-serif",
    googleUrl: "https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap",
  },
];

export const BODY_FONTS: FontOption[] = [
  {
    id: "Inter", name: "Inter", family: "'Inter', sans-serif",
    googleUrl: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap",
  },
  {
    id: "Open Sans", name: "Open Sans", family: "'Open Sans', sans-serif",
    googleUrl: "https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600&display=swap",
  },
  {
    id: "Roboto", name: "Roboto", family: "'Roboto', sans-serif",
    googleUrl: "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap",
  },
  {
    id: "Lato", name: "Lato", family: "'Lato', sans-serif",
    googleUrl: "https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap",
  },
  {
    id: "Poppins", name: "Poppins", family: "'Poppins', sans-serif",
    googleUrl: "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap",
  },
  {
    id: "Nunito Sans", name: "Nunito Sans", family: "'Nunito Sans', sans-serif",
    googleUrl: "https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;600;700&display=swap",
  },
  {
    id: "DM Sans", name: "DM Sans", family: "'DM Sans', sans-serif",
    googleUrl: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap",
  },
  {
    id: "Work Sans", name: "Work Sans", family: "'Work Sans', sans-serif",
    googleUrl: "https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;600&display=swap",
  },
  {
    id: "Mulish", name: "Mulish", family: "'Mulish', sans-serif",
    googleUrl: "https://fonts.googleapis.com/css2?family=Mulish:wght@400;600;700&display=swap",
  },
  {
    id: "Source Sans 3", name: "Source Sans 3", family: "'Source Sans 3', sans-serif",
    googleUrl: "https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&display=swap",
  },
  {
    id: "Karla", name: "Karla", family: "'Karla', sans-serif",
    googleUrl: "https://fonts.googleapis.com/css2?family=Karla:wght@400;500;700&display=swap",
  },
  {
    id: "Noto Sans", name: "Noto Sans", family: "'Noto Sans', sans-serif",
    googleUrl: "https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;600;700&display=swap",
  },
];

export function getDisplayFont(id?: string | null): FontOption {
  return DISPLAY_FONTS.find((f) => f.id === id) ?? DISPLAY_FONTS[0];
}

export function getBodyFont(id?: string | null): FontOption {
  return BODY_FONTS.find((f) => f.id === id) ?? BODY_FONTS[0];
}

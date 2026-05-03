import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "LunchPad Admin",
    template: "%s | LunchPad Admin",
  },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}

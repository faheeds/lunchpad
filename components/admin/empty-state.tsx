import Link from "next/link";
import type { ReactNode } from "react";

export interface EmptyStateProps {
  icon: ReactNode;
  heading: string;
  body: string;
  cta?: {
    href: string;
    label: string;
  };
}

export function EmptyState({ icon, heading, body, cta }: EmptyStateProps) {
  return (
    <div className="rounded-[14px] border border-slate-100 bg-white px-4 py-8 text-center sm:px-6 sm:py-10">
      <div className="flex justify-center mb-3">{icon}</div>
      <h2 className="text-[15px] font-semibold text-ink mb-2">{heading}</h2>
      <p className="text-[12px] text-slate-500 mb-4 leading-relaxed max-w-xs mx-auto">{body}</p>
      {cta && (
        <Link
          href={cta.href}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-700 text-white text-[13px] font-semibold no-underline hover:bg-brand-800 transition"
        >
          {cta.label}
        </Link>
      )}
    </div>
  );
}

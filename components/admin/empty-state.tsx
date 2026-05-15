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
    <div className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">
      <div className="px-4 py-12 text-center space-y-3">
        <div className="flex justify-center mb-3">{icon}</div>
        <h2 className="text-[15px] font-semibold text-ink">{heading}</h2>
        <p className="text-[13px] text-slate-500 max-w-xs mx-auto">{body}</p>
        {cta && (
          <div className="pt-2">
            <Link
              href={cta.href}
              className="inline-block text-[12px] font-semibold text-white bg-brand-700 rounded-lg px-4 py-2 hover:bg-brand-800 transition"
            >
              {cta.label}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

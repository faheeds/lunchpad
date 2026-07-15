"use client";

import Link from "next/link";
import { SiteHeaderServer } from "@/components/site-header-server";
import { SiteFooter } from "@/components/site-footer";
import { AppNav } from "@/components/app-nav";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <>
      <SiteHeaderServer />
      <main className="app-content" id="main-content">
        <div className="px-4 py-4">
          <div className="rounded-[16px] border border-editorial-line bg-editorial-card p-6 text-center shadow-card">
            <p className="text-sm font-medium text-editorial-ink mb-2">Oops, something went wrong</p>
            <p className="text-sm text-editorial-ink-soft mb-6">
              An unexpected error occurred. Please try again.
            </p>
            <button
              onClick={reset}
              className="inline-flex items-center justify-center rounded-full bg-editorial-green text-editorial-paper px-4 py-2.5 text-sm font-semibold hover:bg-editorial-green-deep transition"
            >
              Try again
            </button>
            <p className="mt-4">
              <Link href="/" className="text-editorial-green hover:text-editorial-green-deep text-sm">
                Go home
              </Link>
            </p>
          </div>
        </div>
        <SiteFooter />
      </main>
      <AppNav />
    </>
  );
}

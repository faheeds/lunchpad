import Link from "next/link";
import { SiteHeaderServer } from "@/components/site-header-server";
import { SiteFooter } from "@/components/site-footer";
import { AppNav } from "@/components/app-nav";

export default function NotFound() {
  return (
    <>
      <SiteHeaderServer />
      <main className="app-content" id="main-content">
        <div className="px-4 py-4">
          <div className="rounded-[16px] border border-editorial-line bg-editorial-card p-6 text-center shadow-card">
            <p className="text-4xl font-editorial text-editorial-ink mb-2">404</p>
            <p className="text-sm font-medium text-editorial-ink mb-2">Page not found</p>
            <p className="text-sm text-editorial-ink-soft mb-6">
              The page you're looking for doesn't exist.
            </p>
            <div className="flex flex-col gap-2 items-center">
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-full bg-editorial-green text-editorial-paper px-4 py-2.5 text-sm font-semibold hover:bg-editorial-green-deep transition"
              >
                Go home
              </Link>
              <Link
                href="/menu"
                className="text-editorial-green hover:text-editorial-green-deep text-sm"
              >
                Browse the menu
              </Link>
            </div>
          </div>
        </div>
        <SiteFooter />
      </main>
      <AppNav />
    </>
  );
}

import { SiteHeaderServer } from "@/components/site-header-server";
import { SiteFooter } from "@/components/site-footer";
import { AppNav } from "@/components/app-nav";

export default function Loading() {
  return (
    <>
      <SiteHeaderServer />
      <main className="app-content" id="main-content">
        <div className="px-4 py-4 space-y-4">
          <div className="rounded-[16px] h-32 bg-gray-200 animate-pulse" />
          <div className="rounded-[16px] h-40 bg-gray-200 animate-pulse" />
          <div className="rounded-[16px] h-40 bg-gray-200 animate-pulse" />
        </div>
        <SiteFooter />
      </main>
      <AppNav />
    </>
  );
}

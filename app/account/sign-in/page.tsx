import { env } from "@/lib/env";
import { ParentSignInButtons } from "./sign-in-buttons";
import { NativeAppRedirect } from "./native-app-redirect";
import { SiteHeader } from "@/components/site-header";
import { AppNav } from "@/components/app-nav";

export default function ParentSignInPage() {
  const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  const appleEnabled = Boolean(env.AUTH_APPLE_ID && env.AUTH_APPLE_SECRET);

  return (
    <>
      <NativeAppRedirect />
      <SiteHeader />
      <main className="app-content flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-brand-700 mb-1">Parent account</p>
            <h1 className="text-[20px] font-semibold text-ink mb-1">Sign in</h1>
            <p className="text-[12px] text-slate-500 leading-relaxed">
              Save children, view order history, and plan weekly lunches in one place.
            </p>
          </div>
          <ParentSignInButtons googleEnabled={googleEnabled} appleEnabled={appleEnabled} />
        </div>
      </main>
      <AppNav />
    </>
  );
}

"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 814 1000" xmlns="http://www.w3.org/2000/svg" fill="white">
      <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 790.7 0 663 0 541.8c0-207.5 135.4-317.3 269-317.3 71 0 130.5 46.4 174.9 46.4 42.6 0 109.7-49.4 188.6-49.4 30.5 0 111.4 2.6 163.4 96.3zM549.8 148.8c23.7-28.1 40.8-67.8 40.8-107.5 0-5.8-.6-11.7-1.9-16.2-38.3 1.4-84.1 25.6-111.3 57.1-22.1 25-42.6 64.7-42.6 105.1 0 6.4 1.3 12.8 1.9 14.8 2.3.3 6.1.6 9.7.6 34.2 0 76.6-23.3 103.4-53.9z"/>
    </svg>
  );
}

export function ParentSignInButtons({ googleEnabled, appleEnabled }: { googleEnabled: boolean; appleEnabled: boolean }) {
  const [message, setMessage] = useState("");

  async function handleSignIn(provider: "google" | "apple", enabled: boolean) {
    if (!enabled) { setMessage(`${provider === "google" ? "Google" : "Apple"} sign-in is not configured yet.`); return; }
    setMessage("");
    await signIn(provider, { callbackUrl: "/account" });
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => handleSignIn("google", googleEnabled)}
        disabled={!googleEnabled}
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[13px] font-semibold text-ink disabled:opacity-50 flex items-center justify-center gap-2.5"
      >
        <GoogleIcon /> Continue with Google
      </button>
      <button
        type="button"
        onClick={() => handleSignIn("apple", appleEnabled)}
        disabled={!appleEnabled}
        className="w-full rounded-xl bg-ink px-4 py-3 text-[13px] font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2.5"
      >
        <AppleIcon /> Continue with Apple
      </button>
      {message && <p className="rounded-xl bg-amber-50 px-3 py-2 text-[12px] text-amber-900">{message}</p>}
    </div>
  );
}

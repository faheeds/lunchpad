"use client";

import Link from "next/link";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

export function LoginForm({ restaurantId }: { restaurantId: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  // Surfaced when an admin lands here after completing /admin/reset-password.
  const justReset = searchParams.get("reset") === "1";
  // Surfaced after a teammate accepts an invite. `existing` means their
  // email was already on the team, so the invite was just consumed without
  // creating a new admin row.
  const invitedFlag = searchParams.get("invited");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsPending(true);
    setError("");
    const result = await signIn("admin-credentials", { email, password, restaurantId, redirect: false });
    setIsPending(false);
    if (result?.error) { setError("Invalid email or password."); return; }
    router.push("/admin/dashboard");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {justReset && (
        <p className="text-[12px] text-green-800 bg-green-50 border border-green-100 rounded-xl px-3 py-2">
          Password updated. Sign in with your new password.
        </p>
      )}
      {invitedFlag === "1" && (
        <p className="text-[12px] text-green-800 bg-green-50 border border-green-100 rounded-xl px-3 py-2">
          Account created — sign in with your new password.
        </p>
      )}
      {invitedFlag === "existing" && (
        <p className="text-[12px] text-blue-800 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
          You&apos;re already on this team — sign in with your existing password.
        </p>
      )}
      <div>
        <label className="text-[11px] text-slate-500 mb-1 block">Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
          className="w-full rounded-xl border-slate-200 text-[13px] px-3 py-2.5" placeholder="admin@example.com" />
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] text-slate-500">Password</label>
          <Link
            href="/admin/forgot-password"
            className="text-[11px] font-medium text-brand-700 hover:text-brand-900 no-underline"
          >
            Forgot password?
          </Link>
        </div>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
          className="w-full rounded-xl border-slate-200 text-[13px] px-3 py-2.5" placeholder="••••••••" />
      </div>
      {error && <p className="text-[12px] text-red-700 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
      <button type="submit" disabled={isPending}
        className="w-full py-3 rounded-xl bg-ink text-white text-[13px] font-semibold disabled:opacity-50 mt-1">
        {isPending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}

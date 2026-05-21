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
  const justReset = searchParams.get("reset") === "1";
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
    <form onSubmit={handleSubmit} className="space-y-3.5">
      {justReset && (
        <p className="rounded-xl bg-editorial-sage border border-[#C6CDB2] px-3.5 py-2.5 text-[12px] text-editorial-green">
          Password updated. Sign in with your new password.
        </p>
      )}
      {invitedFlag === "1" && (
        <p className="rounded-xl bg-editorial-sage border border-[#C6CDB2] px-3.5 py-2.5 text-[12px] text-editorial-green">
          Account created â€” sign in with your new password.
        </p>
      )}
      {invitedFlag === "existing" && (
        <p className="rounded-xl bg-editorial-paper border border-editorial-line px-3.5 py-2.5 text-[12px] text-editorial-ink-soft">
          You&apos;re already on this team â€” sign in with your existing password.
        </p>
      )}
      <div>
        <label className="text-[11px] font-medium text-editorial-ink-soft mb-1 block">Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
          className="w-full rounded-xl border border-editorial-line text-[13px] px-3.5 py-2.5 text-editorial-ink focus:border-editorial-green focus:ring-1 focus:ring-editorial-green outline-none" placeholder="admin@example.com" />
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] font-medium text-editorial-ink-soft">Password</label>
          <Link href="/admin/forgot-password"
            className="text-[11px] font-medium text-editorial-green hover:text-editorial-green-deep no-underline">
            Forgot password?
          </Link>
        </div>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
          className="w-full rounded-xl border border-editorial-line text-[13px] px-3.5 py-2.5 text-editorial-ink focus:border-editorial-green focus:ring-1 focus:ring-editorial-green outline-none" placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢" />
      </div>
      {error && <p className="rounded-xl bg-[#F4E3DB] border border-[#E2C3B3] px-3.5 py-2.5 text-[12px] text-[#7C3D24]">{error}</p>}
      <button type="submit" disabled={isPending}
        className="w-full py-3 rounded-full bg-editorial-green text-editorial-paper text-[13px] font-semibold hover:bg-editorial-green-deep transition-colors disabled:opacity-50 mt-1">
        {isPending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}

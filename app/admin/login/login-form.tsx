"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsPending(true);
    setError("");
    const result = await signIn("admin-credentials", { email, password, redirect: false });
    setIsPending(false);
    if (result?.error) { setError("Invalid email or password."); return; }
    router.push("/admin/dashboard");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="text-[11px] text-slate-500 mb-1 block">Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
          className="w-full rounded-xl border-slate-200 text-[13px] px-3 py-2.5" placeholder="admin@example.com" />
      </div>
      <div>
        <label className="text-[11px] text-slate-500 mb-1 block">Password</label>
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

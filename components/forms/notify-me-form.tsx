"use client";

import { useState } from "react";

async function submitNotifyMe(restaurantId: string, email: string) {
  const response = await fetch("/api/notify-me", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ restaurantId, email }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to submit");
  }

  return response.json();
}

export function NotifyMeForm({ restaurantId }: { restaurantId: string }) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await submitNotifyMe(restaurantId, email);
      setSubmitted(true);
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-[16px] border border-editorial-line bg-editorial-card p-6 text-center shadow-card">
        <p className="text-sm font-medium text-editorial-green mb-2">You're all set!</p>
        <p className="text-sm text-editorial-ink-soft">
          We'll email you when new delivery dates are added.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[16px] border border-editorial-line bg-editorial-card p-6 shadow-card">
      <p className="text-sm font-medium text-editorial-ink mb-2">Ordering is closed</p>
      <p className="text-sm text-editorial-ink-soft mb-6">
        There are no upcoming delivery dates at the moment.
      </p>

      <form onSubmit={handleSubmit} className="mb-6">
        <div className="flex gap-2">
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
            className="flex-1 px-3 py-2 rounded-lg border border-editorial-line text-sm focus:outline-none focus:ring-2 focus:ring-editorial-green disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !email}
            className="px-4 py-2 rounded-lg bg-editorial-green text-editorial-paper font-semibold text-sm hover:bg-editorial-green-deep disabled:opacity-50 transition"
          >
            {loading ? "..." : "Notify me"}
          </button>
        </div>
        {error && (
          <p className="text-xs text-red-600 mt-2">{error}</p>
        )}
      </form>

      <p className="text-xs text-editorial-ink-soft text-center">
        We'll send you an email when they're back.
      </p>
    </div>
  );
}

"use client";

import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Oops!</h1>
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-gray-600 mb-4">
          An unexpected error occurred. Please try again.
        </p>
        <div className="flex gap-3">
          <button
            onClick={reset}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition"
          >
            Try again
          </button>
          <Link
            href="/admin"
            className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

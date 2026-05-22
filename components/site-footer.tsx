"use client";

import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="bg-editorial-paper border-t border-editorial-line">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Footer links */}
        <div className="flex flex-wrap justify-center gap-6 text-center sm:justify-start sm:text-left">
          <Link
            href="/terms"
            className="text-sm text-editorial-ink hover:text-editorial-green transition-colors"
          >
            Terms of Service
          </Link>
          <span className="text-editorial-ink-faint">•</span>
          <Link
            href="/privacy"
            className="text-sm text-editorial-ink hover:text-editorial-green transition-colors"
          >
            Privacy Policy
          </Link>
          <span className="text-editorial-ink-faint">•</span>
          <Link
            href="/contact"
            className="text-sm text-editorial-ink hover:text-editorial-green transition-colors"
          >
            Contact Us
          </Link>
        </div>

        {/* Copyright */}
        <div className="mt-8 border-t border-editorial-line pt-8 text-center">
          <p className="text-xs text-editorial-ink-faint">
            © {new Date().getFullYear()} LunchPad. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

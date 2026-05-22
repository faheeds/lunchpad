"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getPageLabel } from "@/lib/admin-labels";

const RECENT_PAGES_STORAGE_KEY = "lunchpad-recent-pages";
const MAX_RECENT_PAGES = 5;

export function RecentPagesDropdown() {
  const pathname = usePathname();
  const [recentPages, setRecentPages] = useState<
    Array<{ href: string; label: string }>
  >([]);
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Initialize and update recent pages
  useEffect(() => {
    // Load from localStorage
    const stored = localStorage.getItem(RECENT_PAGES_STORAGE_KEY);
    const pages = stored ? JSON.parse(stored) : [];

    // Add current page if it's a trackable admin page
    const label = getPageLabel(pathname);
    if (label) {
      // Remove if already in list
      const filtered = pages.filter(
        (p: { href: string; label: string }) => p.href !== pathname
      );

      // Add current page to front
      const updated = [{ href: pathname, label }, ...filtered].slice(
        0,
        MAX_RECENT_PAGES
      );

      setRecentPages(updated);
      localStorage.setItem(RECENT_PAGES_STORAGE_KEY, JSON.stringify(updated));
    } else {
      setRecentPages(pages);
    }
  }, [pathname]);

  // Handle outside clicks
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isOpen]);

  if (recentPages.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title="Recently visited pages"
        className="hidden sm:flex items-center gap-1.5 text-[11px] text-editorial-ink-soft border border-editorial-line rounded-full px-2.5 py-1 hover:bg-editorial-paper transition"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
          <path d="M3 21v-5h5" />
        </svg>
        Recent
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          className="absolute right-0 mt-1 w-48 bg-white rounded-[12px] border border-editorial-line shadow-card z-30 overflow-hidden"
        >
          <div className="p-2">
            {recentPages.map((page) => (
              <Link
                key={page.href}
                href={page.href}
                role="menuitem"
                onClick={() => setIsOpen(false)}
                className="block px-3 py-2 text-[12px] text-editorial-ink-soft hover:text-editorial-ink hover:bg-editorial-paper rounded-lg transition no-underline"
              >
                {page.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

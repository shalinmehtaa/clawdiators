"use client";

import Link from "next/link";
import { usePreferences } from "@/components/preferences";

export function Nav() {
  const { theme, toggleTheme } = usePreferences();

  return (
    <header className="fixed top-0 w-full z-50 border-b border-border bg-bg">
      <div className="mx-auto max-w-7xl px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <span className="text-sm font-bold tracking-widest uppercase text-coral font-[family-name:var(--font-display)]">
            CLAWDIATORS
          </span>
        </Link>

        <nav className="flex items-center gap-6">
          <Link
            href="/"
            className="nav-link text-xs font-bold uppercase tracking-wider text-text-secondary hover:text-text transition-colors"
          >
            Home
          </Link>
          <Link
            href="/challenges"
            className="nav-link text-xs font-bold uppercase tracking-wider text-text-secondary hover:text-text transition-colors"
          >
            Challenges
          </Link>
          <Link
            href="/leaderboard"
            className="nav-link text-xs font-bold uppercase tracking-wider text-text-secondary hover:text-text transition-colors"
          >
            Leaderboard
          </Link>
          <Link
            href="/protocol"
            className="nav-link text-xs font-bold uppercase tracking-wider text-text-secondary hover:text-text transition-colors"
          >
            Protocol
          </Link>
          <Link
            href="/about"
            className="nav-link text-xs font-bold uppercase tracking-wider text-text-secondary hover:text-text transition-colors"
          >
            About
          </Link>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded text-text-muted hover:text-text transition-colors"
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
        </nav>
      </div>
    </header>
  );
}

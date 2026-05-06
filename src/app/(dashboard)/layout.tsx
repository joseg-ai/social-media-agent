import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Nav links for the dashboard. Kept as a single array constant to make
 * 3-way merges easy when other Trinity agents add their pages.
 */
const NAV_LINKS = [
  { href: "/feeds", label: "Feeds" },
  { href: "/queue", label: "Queue" },
  { href: "/history", label: "History" },
  { href: "/prompts", label: "Prompts" },
  { href: "/usage", label: "Usage" },
  { href: "/settings", label: "Settings" },
] as const;

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <nav className="sticky top-0 z-10 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between gap-4">
            {/* Brand */}
            <Link
              href="/feeds"
              className="text-sm font-semibold tracking-tight shrink-0"
            >
              Social Media Agent
            </Link>

            {/* Page links */}
            <ul className="flex items-center gap-1 overflow-x-auto" role="list">
              {NAV_LINKS.map(({ href, label }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="px-3 py-1.5 rounded-md text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>

            {/* Logout */}
            <form action="/api/auth/logout" method="POST" className="shrink-0">
              <button
                type="submit"
                className="text-sm px-3 py-1.5 rounded-md text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Logout
              </button>
            </form>
          </div>
        </div>
      </nav>

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}

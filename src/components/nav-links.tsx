"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/seed", label: "Seed" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Centre of the header — the current page gets a frosted, blurred pill. */
export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="flex shrink-0 items-center justify-center gap-1 text-sm">
      {LINKS.map(({ href, label }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-2 py-1.5 transition-colors focus-ring sm:px-2.5 ${
              active
                ? "bg-raised/70 font-medium text-ink shadow-card backdrop-blur-md"
                : "text-muted hover:bg-tint-sand hover:text-ink"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

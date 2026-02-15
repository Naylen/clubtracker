"use client";

import type { Role } from "@prisma/client";
import { useBrowserPathname } from "./use-browser-pathname";

type NavLink = {
  href: string;
  label: string;
};

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

const ADMIN_LINKS: NavLink[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/members", label: "Members" },
  { href: "/admin/applications", label: "Applications" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/communications", label: "Communications" },
  { href: "/admin/settings", label: "Settings" },
];

const MEMBER_LINKS: NavLink[] = [
  { href: "/portal", label: "Portal" },
  { href: "/portal/profile", label: "My Profile" },
  { href: "/portal/payments", label: "Payments" },
  { href: "/portal/status", label: "Status" },
];

export function TopNav({
  role,
  applicationsOpen,
  userEmail,
}: {
  role: Role | null;
  applicationsOpen: boolean;
  userEmail: string | null;
}) {
  const pathname = useBrowserPathname("/");

  const links: NavLink[] = [{ href: "/", label: "Home" }];
  if (role === "ADMIN") {
    links.push(...ADMIN_LINKS);
  } else if (role === "MEMBER") {
    links.push(...MEMBER_LINKS);
  } else if (applicationsOpen) {
    links.push({ href: "/apply", label: "Apply" });
  }

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <nav className="flex flex-wrap items-center gap-2">
          {links.map((link) => {
            const active = isActivePath(pathname, link.href);
            return (
              <a
                className={classNames(
                  "rounded-full px-3 py-1.5 text-sm font-medium transition",
                  active
                    ? "bg-gray-900 text-white"
                    : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                )}
                href={link.href}
                key={link.href}
              >
                {link.label}
              </a>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          {userEmail ? <p className="hidden text-xs text-gray-500 sm:block">{userEmail}</p> : null}
          {role ? (
            <form action="/api/auth/logout" method="post">
              <button className="rounded border px-3 py-1.5 text-sm font-medium" type="submit">
                Sign Out
              </button>
            </form>
          ) : (
            <a className="rounded border px-3 py-1.5 text-sm font-medium" href="/login">
              Sign In
            </a>
          )}
        </div>
      </div>
    </header>
  );
}

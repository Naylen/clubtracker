"use client";

import { useBrowserPathname } from "./use-browser-pathname";

const LINKS = [
  { href: "/portal", label: "Portal" },
  { href: "/portal/profile", label: "My Profile" },
  { href: "/portal/payments", label: "Payments" },
  { href: "/portal/status", label: "Status" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/portal") {
    return pathname === "/portal";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MemberSubnav() {
  const pathname = useBrowserPathname("/portal");
  return (
    <div className="mx-auto mt-4 max-w-5xl px-6">
      <nav className="flex flex-wrap gap-2">
        {LINKS.map((link) => (
          <a
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              isActive(pathname, link.href)
                ? "bg-gray-900 text-white"
                : "border bg-white text-gray-700 hover:bg-gray-100"
            }`}
            href={link.href}
            key={link.href}
          >
            {link.label}
          </a>
        ))}
      </nav>
    </div>
  );
}

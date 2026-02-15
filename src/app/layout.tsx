import type { Metadata } from "next";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { TopNav } from "@/components/navigation/top-nav";
import { getCurrentYearOperationalState } from "@/services/operations-state";

export const metadata: Metadata = {
  title: "MCFGC Club Management",
  description:
    "Membership management for Montgomery County Fish & Game Club, Inc.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <NavigationShell />
        {children}
      </body>
    </html>
  );
}

async function NavigationShell() {
  const [user, opsState] = await Promise.all([
    getCurrentUser().catch(() => null),
    getCurrentYearOperationalState().catch(() => ({
      applicationPublicOpen: false,
    })),
  ]);

  return (
    <TopNav
      applicationsOpen={opsState.applicationPublicOpen}
      role={user?.role ?? null}
      userEmail={user?.email ?? null}
    />
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MCFGC Club Management",
  description:
    "Membership management for Montgomery County Fish & Game Club, Inc.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}

import type { ReactNode } from "react";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

function toneClass(tone: Tone): string {
  switch (tone) {
    case "success":
      return "border-green-200 bg-green-50 text-green-800";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "danger":
      return "border-red-200 bg-red-50 text-red-800";
    case "info":
      return "border-blue-200 bg-blue-50 text-blue-800";
    default:
      return "border-gray-200 bg-gray-50 text-gray-700";
  }
}

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClass(tone)}`}>
      {children}
    </span>
  );
}

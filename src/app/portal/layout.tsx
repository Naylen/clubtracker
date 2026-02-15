import { requireCurrentUser } from "@/lib/auth";
import { MemberSubnav } from "@/components/navigation/member-subnav";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireCurrentUser("/portal");

  return (
    <div className="space-y-2">
      <MemberSubnav />
      {children}
    </div>
  );
}

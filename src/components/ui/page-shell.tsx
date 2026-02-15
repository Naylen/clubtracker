import type { ReactNode } from "react";
import { Container } from "@/components/ui/container";
import { PageHeader } from "@/components/ui/page-header";

function classNames(...values: Array<string | undefined | null | false>) {
  return values.filter(Boolean).join(" ");
}

export function PageShell({
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Container className={classNames("space-y-6 pb-6", className)}>
      <PageHeader actions={actions} subtitle={subtitle} title={title} />
      {children}
    </Container>
  );
}

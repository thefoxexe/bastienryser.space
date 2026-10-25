import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Page } from "@/components/shell/page";
import { Card, PageHeader } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { requireAdmin } from "@/lib/auth";
import { runSystemChecks, type CheckStatus } from "@/lib/system";

export const metadata: Metadata = { title: "État du système" };

const ICON: Record<CheckStatus, React.ReactNode> = {
  ok: <CheckCircle2 className="size-[18px] text-success" />,
  warning: <AlertTriangle className="size-[18px] text-warning" />,
  error: <XCircle className="size-[18px] text-danger" />,
};

export default async function SystemPage() {
  await requireAdmin();
  const groups = await runSystemChecks();
  const all = groups.flatMap((g) => g.checks);
  const errors = all.filter((c) => c.status === "error").length;
  const warnings = all.filter((c) => c.status === "warning").length;

  return (
    <Page>
      <PageHeader
        eyebrow={<Link href="/reglages" className="hover:text-text">Réglages</Link>}
        title="État du système"
        description={
          errors
            ? `${errors} point${errors > 1 ? "s" : ""} bloquant${errors > 1 ? "s" : ""}${warnings ? ` et ${warnings} à compléter` : ""}.`
            : warnings
              ? `Tout fonctionne. ${warnings} point${warnings > 1 ? "s" : ""} à compléter.`
              : "Tout fonctionne."
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        {groups.map((group) => (
          <Card key={group.title}>
            <h2 className="px-5 pt-5 text-[17px] font-semibold sm:px-6">{group.title}</h2>
            <ul className="divide-y divide-border px-2 pb-2 pt-2">
              {group.checks.map((c) => (
                <li key={c.label} className="flex gap-3 px-3 py-3 sm:px-4">
                  <span className="mt-0.5 shrink-0">{ICON[c.status]}</span>
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium">{c.label}</p>
                    <p className={cn("mt-0.5 text-[13px]", c.status === "ok" ? "text-muted" : "text-text")}>{c.detail}</p>
                    {c.fix && c.status !== "ok" ? <p className="mt-1 text-[12px] text-muted">{c.fix}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </Page>
  );
}

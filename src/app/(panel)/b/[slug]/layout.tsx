import { ExternalLink, Pencil } from "lucide-react";
import { BusinessMark } from "@/components/business-mark";
import { ButtonLink } from "@/components/ui";
import { LinkTabs } from "@/components/ui/tabs";
import { accentStyle } from "@/lib/color";
import { getBusiness } from "@/lib/data";
import { modulesFor } from "@/modules/registry";

export default async function BusinessLayout({ children, params }: LayoutProps<"/b/[slug]">) {
  const { slug } = await params;
  const business = await getBusiness(slug);
  const base = `/b/${business.slug}`;
  const tabs = [{ href: base, label: "Aperçu" }, ...modulesFor(business.modules).map((m) => ({ href: `${base}/${m.basePath}`, label: m.label }))];

  return (
    <div style={accentStyle(business.color)} className="flex min-h-full flex-col">
      <header className="relative border-b border-border bg-surface">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ background: `radial-gradient(40rem 12rem at 0% 0%, ${business.color}, transparent 70%)` }}
        />
        <div className="relative mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 pt-6 sm:px-8 sm:pt-8">
          <div className="flex items-start gap-4">
            <BusinessMark name={business.name} color={business.color} logoUrl={business.logo_url} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-2xl font-semibold tracking-tight">{business.name}</h1>
                {business.archived_at ? <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[12px] text-muted">Archivé</span> : null}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
                {business.description ? <span>{business.description}</span> : null}
                {business.websites.map((w) => (
                  <a key={w} href={w} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:text-text">
                    {w.replace(/^https?:\/\//, "")}
                    <ExternalLink className="size-3" />
                  </a>
                ))}
              </div>
            </div>
            <ButtonLink href={`/reglages/business/${business.slug}`} variant="secondary" size="sm" className="hidden sm:inline-flex">
              <Pencil /> Modifier
            </ButtonLink>
          </div>
          <LinkTabs tabs={tabs} exact={[base]} />
        </div>
      </header>
      {children}
    </div>
  );
}

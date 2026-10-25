import { ArrowUpRight, Pencil } from "lucide-react";
import { BusinessMark } from "@/components/business-mark";
import { ButtonLink } from "@/components/ui";
import { LinkTabs } from "@/components/ui/tabs";
import { getBusiness } from "@/lib/data";
import { modulesFor } from "@/modules/registry";

export default async function BusinessLayout({ children, params }: LayoutProps<"/b/[slug]">) {
  const { slug } = await params;
  const business = await getBusiness(slug);
  const base = `/b/${business.slug}`;
  const tabs = [{ href: base, label: "Aperçu" }, ...modulesFor(business.modules).map((m) => ({ href: `${base}/${m.basePath}`, label: m.label }))];

  return (
    <div className="flex min-h-full flex-col">
      <header className="mx-auto flex w-full max-w-[1200px] flex-col gap-7 px-4 pt-8 sm:px-10 sm:pt-12">
        <div className="animate-rise flex items-center gap-4">
          <BusinessMark name={business.name} color={business.color} logoUrl={business.logo_url} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-[32px] font-semibold leading-tight tracking-[-0.03em]">{business.name}</h1>
              {business.archived_at ? <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[12px] text-muted">Archivé</span> : null}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
              {business.description ? <span>{business.description}</span> : null}
              {business.websites.map((w, i) => (
                <a
                  key={w}
                  href={w}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={`group items-center gap-0.5 transition hover:text-text ${i === 0 ? "inline-flex" : "hidden sm:inline-flex"}`}
                >
                  {w.replace(/^https?:\/\//, "")}
                  <ArrowUpRight className="size-3 opacity-60 transition group-hover:opacity-100" />
                </a>
              ))}
            </div>
          </div>
          <div className="hidden sm:block">
            <ButtonLink href={`/reglages/business/${business.slug}`} variant="secondary" size="sm">
              <Pencil /> Modifier
            </ButtonLink>
          </div>
        </div>
        <div className="border-b border-border">
          <LinkTabs tabs={tabs} exact={[base]} />
        </div>
      </header>
      {children}
    </div>
  );
}

import { LinkTabs } from "@/components/ui/tabs";
import { getBusiness } from "@/lib/data";
import { MODULES } from "@/modules/registry";

export default async function DataLayout({ children, params }: LayoutProps<"/b/[slug]/donnees">) {
  const { slug } = await params;
  const business = await getBusiness(slug);
  const mod = MODULES.find((m) => m.id === "data")!;
  const base = `/b/${business.slug}/${mod.basePath}`;
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 pb-16 pt-6 sm:px-10 sm:pt-8">
      <div className="w-fit max-w-full rounded-[12px] bg-[color-mix(in_oklab,var(--text)_6%,transparent)] p-[3px]">
        <LinkTabs tabs={mod.tabs.map((t) => ({ href: base + t.href, label: t.label }))} exact={[base]} variant="segment" />
      </div>
      {children}
    </div>
  );
}

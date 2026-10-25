import { LinkTabs } from "@/components/ui/tabs";
import { getBusiness } from "@/lib/data";
import { MODULES } from "@/modules/registry";

export default async function SocialLayout({ children, params }: LayoutProps<"/b/[slug]/reseaux">) {
  const { slug } = await params;
  const business = await getBusiness(slug);
  const mod = MODULES.find((m) => m.id === "social")!;
  const base = `/b/${business.slug}/${mod.basePath}`;
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 pt-6 sm:px-8 sm:pt-8">
      <div className="w-fit max-w-full rounded-xl border border-border bg-surface-2 p-1">
        <SegmentTabs tabs={mod.tabs.map((t) => ({ href: base + t.href, label: t.label }))} base={base} />
      </div>
      <div className="-mx-4 sm:-mx-8">{children}</div>
    </div>
  );
}

function SegmentTabs({ tabs, base }: { tabs: { href: string; label: string }[]; base: string }) {
  return <LinkTabs tabs={tabs} exact={[base]} variant="segment" />;
}

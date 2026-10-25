import type { Metadata } from "next";
import Link from "next/link";
import { Page } from "@/components/shell/page";
import { PageHeader } from "@/components/ui";
import { getBusiness } from "@/lib/data";
import { BusinessForm } from "../business-form";

export const metadata: Metadata = { title: "Modifier le business" };

export default async function EditBusinessPage({ params }: PageProps<"/reglages/business/[slug]">) {
  const { slug } = await params;
  const business = await getBusiness(slug);
  return (
    <Page>
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-1.5">
            <Link href="/reglages" className="hover:text-text">Réglages</Link>
            <span className="text-faint">/</span>
            <span>{business.name}</span>
          </span>
        }
        title="Modifier le business"
      />
      <BusinessForm business={business} />
    </Page>
  );
}

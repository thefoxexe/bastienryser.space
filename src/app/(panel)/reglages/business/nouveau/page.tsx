import type { Metadata } from "next";
import Link from "next/link";
import { Page } from "@/components/shell/page";
import { PageHeader } from "@/components/ui";
import { BusinessForm } from "../business-form";

export const metadata: Metadata = { title: "Nouveau business" };

export default function NewBusinessPage() {
  return (
    <Page>
      <PageHeader
        eyebrow={<Link href="/reglages" className="hover:text-text">Réglages</Link>}
        title="Nouveau business"
        description="Chaque business a sa page, sa couleur et ses modules."
      />
      <BusinessForm />
    </Page>
  );
}

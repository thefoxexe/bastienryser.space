import Link from "next/link";
import { LogoMark } from "@/components/logo";

/** Pages légales publiques : lisibles sans connexion, sans rien révéler des business gérés. */
export default function LegalLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="mx-auto w-full max-w-[720px] px-5 py-14 sm:py-20">
      <Link href="/connexion" className="mb-12 inline-flex items-center gap-2.5 text-[15px] font-semibold tracking-tight">
        <LogoMark className="size-7" /> Bastien&apos;s Space
      </Link>
      <article className="flex flex-col gap-5 text-[15px] leading-relaxed text-muted [&_a]:text-text [&_a]:underline [&_a]:underline-offset-2 [&_h1]:text-[34px] [&_h1]:font-semibold [&_h1]:leading-tight [&_h1]:tracking-[-0.035em] [&_h1]:text-text [&_h2]:mt-6 [&_h2]:text-[19px] [&_h2]:font-semibold [&_h2]:text-text [&_li]:ml-5 [&_li]:list-disc">
        {children}
      </article>
    </main>
  );
}

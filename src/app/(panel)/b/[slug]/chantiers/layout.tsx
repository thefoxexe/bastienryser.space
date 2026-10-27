export default function ProjectsLayout({ children }: LayoutProps<"/b/[slug]/chantiers">) {
  return <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 pb-16 pt-6 sm:px-10 sm:pt-8">{children}</div>;
}

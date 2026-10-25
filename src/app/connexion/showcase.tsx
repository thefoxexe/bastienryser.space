"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { LogoMark } from "@/components/logo";
import { BrandMark } from "@/components/brand-logos";
import { cn } from "@/components/ui/cn";

/**
 * Décor animé autour de la connexion : ce que fait le panel (posts, chiffres, revenus, sites, déploiements),
 * en cartes flottantes qui suivent légèrement la souris. Purement illustratif : aucune donnée réelle n'est
 * chargée avant la connexion, donc aucun chiffre n'y figure.
 */
export function Showcase() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty("--mx", (e.clientX / innerWidth - 0.5).toFixed(3));
        el.style.setProperty("--my", (e.clientY / innerHeight - 0.5).toFixed(3));
      });
    };
    addEventListener("pointermove", onMove);
    return () => {
      removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0 hidden select-none lg:block">
      <Float depth={18} delay={0} className="left-[5%] top-[11%] xl:left-[8%]">
        <RevenueCard />
      </Float>
      <Float depth={-26} delay={1.4} className="right-[5%] top-[8%] xl:right-[9%]">
        <PostCard />
      </Float>
      <Float depth={-14} delay={0.7} className="bottom-[9%] left-[4%] xl:left-[7%]">
        <TerminalCard />
      </Float>
      <Float depth={22} delay={2.1} className="bottom-[12%] right-[4%] xl:right-[8%]">
        <SitesCard />
      </Float>
      <Float depth={-34} delay={0.3} className="right-[25%] top-[4%] hidden 2xl:block">
        <Notification />
      </Float>
      <Float depth={30} delay={1.8} className="bottom-[5%] left-[30%] hidden 2xl:block">
        <KeywordCard />
      </Float>
    </div>
  );
}

/** Position + parallaxe (couche externe) et flottement lent (couche interne), pour que les deux mouvements s'additionnent. */
function Float({ depth, delay, className, children }: { depth: number; delay: number; className?: string; children: ReactNode }) {
  return (
    <div
      className={cn("absolute transition-transform duration-700 ease-[var(--ease-apple)]", className)}
      style={{ transform: `translate3d(calc(var(--mx, 0) * ${depth}px), calc(var(--my, 0) * ${depth}px), 0)` }}
    >
      <div className="animate-float-in" style={{ animationDelay: `${0.2 + delay * 0.15}s, ${delay}s` }}>
        {children}
      </div>
    </div>
  );
}

function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-[22px] bg-[color-mix(in_oklab,var(--surface)_78%,transparent)] p-4 shadow-pop backdrop-blur-xl backdrop-saturate-150",
        className,
      )}
    >
      {children}
    </div>
  );
}

function Label({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3 text-[12px] font-medium text-muted">
      <span>{children}</span>
      {right}
    </div>
  );
}

/** Courbe verte qui se trace, avec son halo. */
function RevenueCard() {
  const d = "M0 62 C 22 60, 30 48, 52 50 S 84 30, 106 36 S 140 18, 162 22 S 196 6, 220 8";
  return (
    <Panel className="w-[260px]">
      <Label right={<BrandMark brand="stripe" className="size-4" />}>Revenus · 30 jours</Label>
      <div className="mb-3 flex items-end gap-2">
        <span className="h-6 w-28 rounded-md bg-fill-strong" />
        <span className="text-glow mb-0.5 text-[12px] font-semibold">en hausse</span>
      </div>
      <svg viewBox="0 0 220 70" className="h-[70px] w-full overflow-visible">
        <defs>
          <linearGradient id="login-fade" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--green)" stopOpacity={0.22} />
            <stop offset="1" stopColor="var(--green)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={`${d} L220 70 L0 70 Z`} fill="url(#login-fade)" className="animate-reveal" />
        <path d={d} fill="none" stroke="var(--green)" strokeWidth={6} strokeLinecap="round" className="animate-draw opacity-50 blur-[5px]" pathLength={1} />
        <path d={d} fill="none" stroke="var(--green)" strokeWidth={2} strokeLinecap="round" className="animate-draw" pathLength={1} />
      </svg>
    </Panel>
  );
}

/** Post qui passe de « Programmé » à « Publié ». */
function PostCard() {
  return (
    <Panel className="w-[236px] p-3">
      <div className="mb-2.5 flex items-center gap-2 px-1">
        <span className="grid size-7 place-items-center rounded-full bg-ink text-ink-text">
          <LogoMark className="size-4" />
        </span>
        <span className="flex-1 text-[13px] font-semibold">bastienryser.space</span>
        <BrandMark brand="instagram" className="size-4" />
      </div>
      <div className="relative aspect-[4/5] overflow-hidden rounded-[14px] bg-[linear-gradient(160deg,#2c2c2e,#0b0b0c)]">
        <div className="absolute -right-10 -top-12 size-44 rounded-full bg-[radial-gradient(closest-side,rgb(255_255_255/0.22),transparent)]" />
        <div className="absolute inset-x-4 bottom-4 flex flex-col gap-1.5">
          <span className="h-2.5 w-3/4 rounded-full bg-white/80" />
          <span className="h-2.5 w-1/2 rounded-full bg-white/45" />
        </div>
        <LogoMark className="absolute left-4 top-4 size-6 text-white" />
      </div>
      <div className="relative mt-3 h-5 px-1 text-[12px]">
        <span className="animate-step-1 absolute inset-0 flex items-center gap-1.5 text-muted">
          <span className="size-1.5 rounded-full bg-faint" /> Programmé · lundi 09:00
        </span>
        <span className="animate-step-2 absolute inset-0 flex items-center gap-1.5 text-muted">
          <span className="size-1.5 animate-pulse rounded-full bg-ink" /> Publication en cours…
        </span>
        <span className="animate-step-3 absolute inset-0 flex items-center gap-1.5 font-medium text-green-text">
          <span className="dot-glow size-1.5 rounded-full" /> Publié sur Instagram
        </span>
      </div>
    </Panel>
  );
}

/** Terminal de déploiement, lignes tapées l'une après l'autre. */
function TerminalCard() {
  const lines: [string, string?][] = [
    ["$ git push origin main"],
    ["→ Vercel · build en cours"],
    ["✓ Déployé sur bastienryser.space", "text-[#30d158]"],
    ["$ supabase functions deploy"],
    ["✓ Edge Functions actives", "text-[#30d158]"],
  ];
  return (
    <div className="w-[300px] overflow-hidden rounded-[18px] bg-[#0b0b0c] shadow-pop ring-1 ring-white/10">
      <div className="flex items-center gap-1.5 border-b border-white/[0.07] px-3.5 py-2.5">
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="ml-2 font-mono text-[11px] text-white/40">deploy — zsh</span>
      </div>
      <div className="flex flex-col gap-1 px-3.5 py-3 font-mono text-[11.5px] leading-[1.55] text-[#f5f5f7]">
        {lines.map(([text, tone], i) => (
          <span key={i} className={cn("animate-type block overflow-hidden whitespace-nowrap", tone)} style={{ "--i": i, "--chars": text.length } as CSSProperties}>
            {text}
          </span>
        ))}
        <span className="animate-blink mt-0.5 block h-3.5 w-[7px] bg-[#f5f5f7]/80" />
      </div>
    </div>
  );
}

/** Surveillance des sites : points qui pulsent, barres de disponibilité. */
function SitesCard() {
  // Adresses génériques : rien ne doit trahir les business gérés derrière la connexion.
  const sites = ["bastienryser.space", "boutique.exemple.ch", "blog.exemple.ch"];
  return (
    <Panel className="w-[272px]">
      <Label right={<span className="text-glow text-[11px] font-semibold">Tout répond</span>}>Sites web</Label>
      <ul className="flex flex-col gap-3">
        {sites.map((s, k) => (
          <li key={s}>
            <div className="mb-1.5 flex items-center gap-2 text-[12.5px] font-medium">
              <span className="relative flex size-2">
                <span className="absolute inset-0 animate-ping rounded-full bg-green opacity-40" style={{ animationDelay: `${k * 0.6}s` }} />
                <span className="dot-glow relative size-2 rounded-full" />
              </span>
              {s}
            </div>
            <div className="flex h-2.5 gap-[1.5px]">
              {Array.from({ length: 30 }, (_, i) => (
                <span key={i} className="animate-bar flex-1 rounded-[2px] bg-green/80" style={{ animationDelay: `${0.6 + k * 0.25 + i * 0.03}s` }} />
              ))}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Notification façon iOS. */
function Notification() {
  return (
    <div className="animate-notify w-[300px] rounded-[20px] bg-[color-mix(in_oklab,var(--surface)_72%,transparent)] p-3 shadow-pop backdrop-blur-xl">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-ink text-ink-text">
          <LogoMark className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between text-[12px]">
            <span className="font-semibold">bastienryser</span>
            <span className="text-faint">maintenant</span>
          </div>
          <p className="text-[13px] font-medium">Mot-clé en hausse</p>
          <p className="truncate text-[12.5px] text-muted">Un mot-clé suivi passe dans le top 3</p>
        </div>
      </div>
    </div>
  );
}

/** Classement d'un mot-clé qui grimpe. */
function KeywordCard() {
  return (
    <Panel className="w-[240px]">
      <Label right={<BrandMark brand="search_console" className="size-4" />}>Position dans Google</Label>
      <svg viewBox="0 0 200 60" className="h-[60px] w-full overflow-visible">
        <rect x={0} y={0} width={200} height={22} rx={4} fill="var(--green)" opacity={0.08} />
        <path d="M0 54 C 30 52, 40 44, 70 40 S 120 30, 140 20 S 180 10, 200 6" fill="none" stroke="var(--green)" strokeWidth={6} className="animate-draw opacity-50 blur-[5px]" pathLength={1} />
        <path d="M0 54 C 30 52, 40 44, 70 40 S 120 30, 140 20 S 180 10, 200 6" fill="none" stroke="var(--green)" strokeWidth={2} strokeLinecap="round" className="animate-draw" pathLength={1} />
      </svg>
      <p className="mt-2 text-[11px] text-faint">Première page de Google</p>
    </Panel>
  );
}

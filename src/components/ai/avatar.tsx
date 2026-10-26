import { cn } from "@/components/ui/cn";

export type AvatarState = "idle" | "thinking" | "speaking" | "listening";

/** Le personnage de l'assistant : une bille noire qui cligne des yeux, cherche du regard et parle. */
export function AiAvatar({ state = "idle", className }: { state?: AvatarState; className?: string }) {
  return (
    <span className={cn("relative inline-grid shrink-0 place-items-center", className)} aria-hidden>
      {state === "listening" ? <span className="ai-ring absolute inset-0 rounded-full bg-green" /> : null}
      <svg
        viewBox="0 0 40 40"
        className={cn("relative size-full drop-shadow-[0_2px_6px_rgb(0_0_0/0.18)]", state === "thinking" && "ai-thinking", state === "speaking" && "ai-speaking")}
      >
        <defs>
          <radialGradient id="ai-shine" cx="0.32" cy="0.25" r="0.75">
            <stop offset="0" stopColor="#4a4a4f" />
            <stop offset="0.55" stopColor="#1d1d1f" />
            <stop offset="1" stopColor="#000" />
          </radialGradient>
        </defs>
        <circle cx="20" cy="20" r="19" fill="url(#ai-shine)" stroke="rgb(255 255 255 / 0.14)" strokeWidth="0.75" />
        <g className="ai-eyes">
          <g className="ai-pupils" fill="#f5f5f7">
            <ellipse cx="14.5" cy="17.5" rx="2.4" ry="3.2" />
            <ellipse cx="25.5" cy="17.5" rx="2.4" ry="3.2" />
          </g>
        </g>
        <rect className="ai-mouth" x="16" y="25" width="8" height="3.4" rx="1.7" fill={state === "listening" ? "var(--green)" : "#f5f5f7"} />
      </svg>
    </span>
  );
}

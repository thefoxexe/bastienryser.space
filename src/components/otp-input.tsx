"use client";

import { useRef, useState } from "react";
import { cn } from "@/components/ui/cn";

/**
 * Code à 6 chiffres en cases séparées : avance automatique, retour arrière, collage d'un code complet.
 * La valeur est envoyée dans un champ caché `name`. `onComplete` est appelé quand les 6 chiffres sont saisis.
 */
export function OtpInput({
  name = "code",
  autoFocus,
  disabled,
  invalid,
  onComplete,
}: {
  name?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  onComplete?: () => void;
}) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  function update(next: string[]) {
    setDigits(next);
    if (next.every((d) => d !== "")) {
      // Laisse React écrire la valeur du champ caché avant l'envoi.
      requestAnimationFrame(() => onComplete?.());
    }
  }

  function fill(from: number, text: string) {
    const chars = text.replace(/\D/g, "").slice(0, 6 - from).split("");
    if (!chars.length) return;
    const next = [...digits];
    chars.forEach((c, i) => (next[from + i] = c));
    update(next);
    refs.current[Math.min(from + chars.length, 5)]?.focus();
  }

  return (
    <div className="flex justify-between gap-2" onPaste={(e) => {
      e.preventDefault();
      fill(0, e.clipboardData.getData("text"));
    }}>
      <input type="hidden" name={name} value={digits.join("")} />
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Chiffre ${i + 1}`}
          maxLength={6}
          onChange={(e) => fill(i, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !digits[i] && i > 0) {
              const next = [...digits];
              next[i - 1] = "";
              setDigits(next);
              refs.current[i - 1]?.focus();
              e.preventDefault();
            }
            if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
            if (e.key === "ArrowRight" && i < 5) refs.current[i + 1]?.focus();
          }}
          onFocus={(e) => e.target.select()}
          className={cn(
            "h-14 w-full min-w-0 rounded-[14px] bg-[color-mix(in_oklab,var(--text)_5%,var(--surface))] text-center font-[family-name:var(--font-display)] text-[24px] font-medium tabular text-text outline-none ring-1 ring-transparent transition-all duration-200 focus:bg-surface focus:ring-[color-mix(in_oklab,var(--text)_35%,transparent)] focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--text)_7%,transparent)] disabled:opacity-50",
            invalid && "ring-[color-mix(in_oklab,var(--danger)_60%,transparent)]",
          )}
        />
      ))}
    </div>
  );
}

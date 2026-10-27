"use client";

import { useEffect, useState } from "react";

/** « 1:04:09 » depuis `since`, mis à jour chaque seconde. */
export function useElapsed(since: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [since]);
  if (!since) return "0:00:00";
  const s = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function Elapsed({ since, className }: { since: string; className?: string }) {
  return (
    <span className={className} suppressHydrationWarning>
      {useElapsed(since)}
    </span>
  );
}

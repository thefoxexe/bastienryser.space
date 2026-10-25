/** Choisit un texte noir ou blanc lisible sur une couleur donnée. */
export function readableOn(hex: string) {
  const v = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.45 ? "#111110" : "#ffffff";
}

/** Variables CSS d'accent pour un business. */
export function accentStyle(color: string): React.CSSProperties {
  return {
    "--accent": color,
    "--accent-text": readableOn(color),
  } as React.CSSProperties;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

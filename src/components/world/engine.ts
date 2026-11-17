// Moteur 3D des nuages de recherches (three.js, sans React).
// Un amas par rubrique du site ; chaque recherche Google est un mot (taille = affichages,
// distance au cœur de l'amas = position Google, vert = a rapporté des clics).

import * as THREE from "three";
import type { World, WorldQuery } from "@/lib/web-world";

export const GREEN = new THREE.Color("#28c157");

export type Item = { data: WorldQuery; pos: THREE.Vector3 };
export type Cluster = {
  group: THREE.Group;
  /** Sphère invisible qui englobe le nuage (clic dans l'univers). */
  hit: THREE.Mesh;
  radius: number;
  items: Item[];
  centers: Map<string, THREE.Vector3>;
  dispose: () => void;
};

/** Hasard reproductible : le même site donne toujours le même nuage. */
function seeded(text: string) {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function fibonacci(i: number, n: number) {
  if (n === 1) return new THREE.Vector3(0, 0, 0);
  const y = 1 - ((i + 0.5) / n) * 2;
  const r = Math.sqrt(1 - y * y);
  const t = i * Math.PI * (3 - Math.sqrt(5));
  return new THREE.Vector3(Math.cos(t) * r, y * 0.7, Math.sin(t) * r);
}

function randomDir(rand: () => number) {
  const u = rand() * 2 - 1;
  const t = rand() * Math.PI * 2;
  const r = Math.sqrt(1 - u * u);
  return new THREE.Vector3(r * Math.cos(t), u * 0.85, r * Math.sin(t));
}

const POINT_VERTEX = `
  attribute float size;
  attribute vec3 color;
  uniform float uScale;
  varying vec3 vColor;
  void main() {
    vColor = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * uScale * (260.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const POINT_FRAGMENT = `
  varying vec3 vColor;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float core = smoothstep(0.22, 0.0, d);
    float halo = smoothstep(0.5, 0.0, d) * 0.4;
    gl_FragColor = vec4(vColor, core + halo);
  }
`;

export function pointMaterial(scale: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uScale: { value: scale } },
    vertexShader: POINT_VERTEX,
    fragmentShader: POINT_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/** Ciel étoilé discret (fond des vues plein écran). */
export function stars(count = 1200, radius = 260) {
  const rand = seeded("stars");
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const v = randomDir(rand).normalize().multiplyScalar(radius * (0.6 + rand() * 0.4));
    pos.set([v.x, v.y, v.z], i * 3);
    size[i] = 0.5 + rand() * 1.2;
    const b = 0.25 + rand() * 0.35;
    col.set([b, b, b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("size", new THREE.BufferAttribute(size, 1));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return new THREE.Points(g, pointMaterial(1));
}

/** Mot en 3D : texte net (dessiné en double résolution), toujours face à la caméra. */
function word(text: string, height: number, color: string, weight = 600, opacity = 1) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const px = 64;
  const font = `${weight} ${px}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 24;
  canvas.width = w;
  canvas.height = px + 24;
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, 12, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, opacity });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set((height * canvas.width) / canvas.height, height, 1);
  return { sprite, dispose: () => (texture.dispose(), material.dispose()) };
}

const colorOf = (q: WorldQuery) => (q.clicks > 0 ? "#3ddc6f" : q.position <= 10 ? "#f4f5f7" : q.position <= 30 ? "#a3a8ae" : "#676b71");

/**
 * Nuage d'un site. `words` : nombre de recherches écrites en toutes lettres (les autres sont des points lumineux).
 */
export function createCluster(world: World, opts: { words: number; dots: number; pixelRatio: number; titles: boolean }): Cluster {
  const rand = seeded(world.domain || world.slug);
  const group = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(o: T) => (disposables.push(o), o);

  // Amas : les rubriques qui ont des recherches, les plus fortes d'abord ; les petites réunies dans « autres ».
  const queries = world.queries.slice(0, opts.dots);
  const bySection = new Map<string, WorldQuery[]>();
  for (const q of queries) bySection.set(q.section, [...(bySection.get(q.section) ?? []), q]);
  const ranked = [...bySection.entries()].sort((a, b) => b[1].reduce((s, q) => s + q.impressions, 0) - a[1].reduce((s, q) => s + q.impressions, 0));
  const groups = ranked.slice(0, 9);
  const rest = ranked.slice(9).flatMap(([, list]) => list);
  if (rest.length) groups.push(["autres", rest]);

  const spread = groups.length === 1 ? 0 : 12 + groups.length * 2.2;
  const centers = new Map<string, THREE.Vector3>();
  // L'amas le plus vu au centre, les autres en couronne autour.
  groups.forEach(([name], i) => centers.set(name, i === 0 ? new THREE.Vector3() : fibonacci(i - 1, Math.max(groups.length - 1, 1)).multiplyScalar(spread)));

  const maxImpr = Math.max(1, ...queries.map((q) => q.impressions));
  const items: Item[] = [];
  const pos = new Float32Array(queries.length * 3);
  const size = new Float32Array(queries.length);
  const col = new Float32Array(queries.length * 3);
  const links: number[] = [];
  // Mots écrits : les plus vus, mais pas plus de 22 par amas (le reste en points lumineux).
  const perGroup = new Map<string, number>();
  const written = new Set(
    queries.slice(0, opts.words * 2).filter((q) => {
      const n = perGroup.get(q.section) ?? 0;
      if (n >= 22) return false;
      perGroup.set(q.section, n + 1);
      return true;
    }).slice(0, opts.words),
  );
  let k = 0;
  let radius = 0;

  for (const [name, list] of groups) {
    const center = centers.get(name)!;
    const r = 3.2 + Math.sqrt(list.length) * 1.5;
    for (const q of list) {
      // Plus la position Google est bonne, plus la recherche est près du cœur de l'amas.
      const depth = 0.18 + 0.82 * Math.pow(Math.min(Math.max(q.position, 1), 60) / 60, 0.55);
      const p = randomDir(rand).multiplyScalar(r * depth * (0.85 + rand() * 0.3)).add(center);
      items.push({ data: q, pos: p });
      radius = Math.max(radius, p.length());
      pos.set([p.x, p.y, p.z], k * 3);
      size[k] = written.has(q) ? 0 : 0.6 + Math.sqrt(q.impressions / maxImpr) * 3.4;
      const c = new THREE.Color(colorOf(q));
      col.set([c.r, c.g, c.b], k * 3);
      links.push(p.x, p.y, p.z, center.x, center.y, center.z);
      k++;
      if (written.has(q)) {
        // Échelle logarithmique : une recherche dominante n'écrase pas toutes les autres.
        const h = 0.5 + (Math.log(1 + q.impressions) / Math.log(1 + maxImpr)) * 1.45;
        const w = track(word(q.q, h, colorOf(q), q.clicks > 0 || q.position <= 10 ? 600 : 500));
        w.sprite.position.copy(p);
        group.add(w.sprite);
      }
    }
    // Cœur de l'amas : lueur et nom de la rubrique.
    const glow = track(word("●", 1.4, "#3ddc6f", 400, 0.5));
    glow.sprite.position.copy(center);
    group.add(glow.sprite);
    if (opts.titles) {
      const title = track(word(name.toUpperCase(), 0.62, "#ffffff", 700, 0.55));
      title.sprite.position.copy(center).add(new THREE.Vector3(0, -0.9, 0));
      group.add(title.sprite);
    }
  }

  const g = track(new THREE.BufferGeometry());
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("size", new THREE.BufferAttribute(size, 1));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  group.add(new THREE.Points(g, track(pointMaterial(opts.pixelRatio))));
  const lg = track(new THREE.BufferGeometry());
  lg.setAttribute("position", new THREE.Float32BufferAttribute(links, 3));
  group.add(new THREE.LineSegments(lg, track(new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.06 }))));

  radius = Math.max(radius + 1.5, 6);
  const hit = new THREE.Mesh(track(new THREE.SphereGeometry(radius, 16, 16)), track(new THREE.MeshBasicMaterial({ visible: false })));
  group.add(hit);

  return { group, hit, radius, items, centers, dispose: () => disposables.forEach((d) => d.dispose()) };
}

export function makeRenderer(width: number, height: number) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.setClearColor(0x000000, 0);
  return renderer;
}

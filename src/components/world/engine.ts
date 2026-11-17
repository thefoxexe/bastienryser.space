// Moteur 3D des « mondes » (three.js, sans React) : une planète par site, ses rubriques en continents,
// ses pages en tours (hauteur = affichages Google) et ses recherches en satellites
// (taille = affichages, altitude = position Google, vert = a rapporté des clics).

import * as THREE from "three";
import type { World, WorldPage, WorldQuery } from "@/lib/web-world";

export const R = 10;
export const GREEN = new THREE.Color("#28c157");

export type Item = { kind: "query"; data: WorldQuery; pos: THREE.Vector3 } | { kind: "page"; data: WorldPage; pos: THREE.Vector3 };
export type Label = { text: string; sub?: string; pos: THREE.Vector3; kind: "section" | "query" | "page"; weight: number };
export type Planet = {
  group: THREE.Group;
  core: THREE.Mesh;
  points: THREE.Points;
  items: Item[];
  labels: Label[];
  sectionDirs: Map<string, THREE.Vector3>;
  pageDirs: Map<string, THREE.Vector3>;
  dispose: () => void;
};

/** Hasard reproductible : le même site donne toujours la même planète. */
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

/** Points répartis régulièrement sur la sphère (spirale de Fibonacci). */
function fibonacci(i: number, n: number) {
  const y = 1 - ((i + 0.5) / n) * 2;
  const r = Math.sqrt(1 - y * y);
  const t = i * Math.PI * (3 - Math.sqrt(5));
  return new THREE.Vector3(Math.cos(t) * r, y * 0.92, Math.sin(t) * r).normalize();
}

/** Direction voisine de `dir`, à `angle` radians dans une direction tirée au hasard. */
function around(dir: THREE.Vector3, angle: number, rand: () => number) {
  const helper = Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const t1 = new THREE.Vector3().crossVectors(dir, helper).normalize();
  const t2 = new THREE.Vector3().crossVectors(dir, t1).normalize();
  const a = rand() * Math.PI * 2;
  const offset = t1.multiplyScalar(Math.cos(a)).add(t2.multiplyScalar(Math.sin(a)));
  return dir.clone().multiplyScalar(Math.cos(angle)).add(offset.multiplyScalar(Math.sin(angle))).normalize();
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
    float halo = smoothstep(0.5, 0.0, d) * 0.45;
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

/** Halo d'atmosphère (effet de Fresnel) autour de la planète. */
function atmosphere(radius: number, color: THREE.Color, intensity: number) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius, 64, 64),
    new THREE.ShaderMaterial({
      uniforms: { uColor: { value: color }, uIntensity: { value: intensity } },
      vertexShader: `
        varying vec3 vNormal; varying vec3 vView;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uIntensity;
        varying vec3 vNormal; varying vec3 vView;
        void main() {
          float f = pow(1.0 - max(dot(vNormal, vView), 0.0), 3.4);
          gl_FragColor = vec4(uColor, f * uIntensity);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
}

/** Ciel étoilé discret (fond des vues plein écran). */
export function stars(count = 1400, radius = 240) {
  const rand = seeded("stars");
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const v = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize().multiplyScalar(radius * (0.6 + rand() * 0.4));
    pos.set([v.x, v.y, v.z], i * 3);
    size[i] = 0.6 + rand() * 1.4;
    const b = 0.35 + rand() * 0.4;
    col.set([b, b, b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("size", new THREE.BufferAttribute(size, 1));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return new THREE.Points(g, pointMaterial(1));
}

/** Altitude d'une recherche : 1re position → au ras du sol, 50e position et au-delà → très haut dans le ciel. */
const altitude = (position: number) => R + 0.7 + Math.pow(Math.min(Math.max(position, 1), 60) / 60, 0.75) * 7.5;

export function createPlanet(world: World, detail: "mini" | "full", pixelRatio: number): Planet {
  const rand = seeded(world.domain || world.slug);
  const group = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(o: T) => (disposables.push(o), o);

  // Noyau sombre et atmosphère fine.
  const core = new THREE.Mesh(
    track(new THREE.SphereGeometry(R, 72, 72)),
    track(new THREE.MeshStandardMaterial({ color: "#0b0c0e", roughness: 0.9, metalness: 0.1, emissive: "#040505" })),
  );
  group.add(core);
  const atmo = atmosphere(R * 1.07, new THREE.Color("#7fe3a0"), detail === "mini" ? 0.75 : 0.6);
  track(atmo.geometry);
  track(atmo.material as THREE.Material);
  group.add(atmo);

  // Continents : une zone par rubrique autour de l'équateur, la plus vue face à la caméra au départ.
  const sections = world.sections.filter((s) => world.pages.some((p) => p.section === s.name));
  const sectionDirs = new Map<string, THREE.Vector3>();
  sections.forEach((s, i) => {
    const lon = i * 2.39996;
    const lat = i === 0 ? 0.12 : ((((i * 0.618034) % 1) - 0.5) * 1.15);
    sectionDirs.set(s.name, new THREE.Vector3(Math.sin(lon) * Math.cos(lat), Math.sin(lat), Math.cos(lon) * Math.cos(lat)));
  });
  const capOf = (pages: number) => Math.min(0.62, 0.12 + Math.sqrt(pages) * 0.05);

  // Surface en trame de points : plus dense et plus claire sur les continents (façon globe en direct).
  {
    const n = detail === "mini" ? 2200 : 5200;
    const caps = sections.map((s) => ({ dir: sectionDirs.get(s.name)!, cap: capOf(Math.min(s.pages, 60)) * 1.5 + 0.08, strong: s.impressions > 0 }));
    const pos = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const d = fibonacci(i, n);
      let land = 0;
      for (const c of caps) {
        const angle = d.angleTo(c.dir);
        if (angle < c.cap) land = Math.max(land, (1 - angle / c.cap) * (c.strong ? 1 : 0.45));
      }
      const v = d.multiplyScalar(R * 1.004);
      pos.set([v.x, v.y, v.z], i * 3);
      size[i] = land > 0 ? 0.55 + land * 0.35 : 0.42;
      const c = land > 0 ? new THREE.Color("#ffffff").lerp(GREEN, 0.25 + land * 0.4).multiplyScalar(0.28 + land * 0.55) : new THREE.Color("#ffffff").multiplyScalar(0.09);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const g = track(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("size", new THREE.BufferAttribute(size, 1));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    group.add(new THREE.Points(g, track(pointMaterial(pixelRatio))));
  }

  // Pages : tours posées dans leur continent.
  const pages = detail === "mini" ? world.pages.filter((p) => p.inGoogle).slice(0, 60) : world.pages;
  const pageDirs = new Map<string, THREE.Vector3>();
  const items: Item[] = [];
  const maxPage = Math.max(1, ...pages.map((p) => p.impressions));
  const tower = track(new THREE.BoxGeometry(0.11, 1, 0.11));
  tower.translate(0, 0.5, 0);
  const towers = new THREE.InstancedMesh(tower, track(new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9 })), pages.length);
  const counts = new Map<string, number>();
  pages.forEach((p, i) => {
    const center = sectionDirs.get(p.section) ?? fibonacci(i, pages.length);
    const total = world.sections.find((s) => s.name === p.section)?.pages ?? 1;
    const n = counts.get(p.section) ?? 0;
    counts.set(p.section, n + 1);
    // La page la plus vue au centre du continent, les autres autour.
    const dir = n === 0 ? center.clone() : around(center, capOf(Math.min(total, 60)) * Math.sqrt(rand()), rand);
    pageDirs.set(p.path, dir);
    const height = p.inGoogle ? 0.18 + (Math.log10(1 + p.impressions) / Math.log10(1 + maxPage)) * 2.2 : 0.12;
    const m = new THREE.Matrix4().compose(
      dir.clone().multiplyScalar(R),
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir),
      new THREE.Vector3(1, height, 1),
    );
    towers.setMatrixAt(i, m);
    towers.setColorAt(i, p.inGoogle ? (p.clicks > 0 ? GREEN : new THREE.Color("#e9eaec")) : new THREE.Color("#4a4d52"));
    items.push({ kind: "page", data: p, pos: dir.clone().multiplyScalar(R + height) });
  });
  group.add(towers);

  // Recherches : satellites au-dessus de leur page.
  const queries = world.queries.slice(0, detail === "mini" ? 260 : 600);
  const maxImpr = Math.max(1, ...queries.map((q) => q.impressions));
  const qPos = new Float32Array(queries.length * 3);
  const qSize = new Float32Array(queries.length);
  const qCol = new Float32Array(queries.length * 3);
  const tethers: number[] = [];
  queries.forEach((q, i) => {
    const base = pageDirs.get(q.page) ?? sectionDirs.values().next().value ?? new THREE.Vector3(0, 1, 0);
    const dir = around(base, 0.025 + rand() * 0.11, rand);
    const pos = dir.clone().multiplyScalar(altitude(q.position));
    qPos.set([pos.x, pos.y, pos.z], i * 3);
    qSize[i] = 0.7 + Math.sqrt(q.impressions / maxImpr) * 5.5;
    const c = q.clicks > 0 ? GREEN.clone().lerp(new THREE.Color("#ffffff"), 0.15) : new THREE.Color(q.position <= 10 ? "#f2f3f5" : q.position <= 30 ? "#9ea3aa" : "#5c6066");
    qCol.set([c.r, c.g, c.b], i * 3);
    items.push({ kind: "query", data: q, pos });
    if (detail === "full") {
      const foot = base.clone().multiplyScalar(R);
      tethers.push(pos.x, pos.y, pos.z, foot.x, foot.y, foot.z);
    }
  });
  const pg = track(new THREE.BufferGeometry());
  pg.setAttribute("position", new THREE.BufferAttribute(qPos, 3));
  pg.setAttribute("size", new THREE.BufferAttribute(qSize, 1));
  pg.setAttribute("color", new THREE.BufferAttribute(qCol, 3));
  const points = new THREE.Points(pg, track(pointMaterial(pixelRatio)));
  group.add(points);
  if (tethers.length) {
    const lg = track(new THREE.BufferGeometry());
    lg.setAttribute("position", new THREE.Float32BufferAttribute(tethers, 3));
    group.add(new THREE.LineSegments(lg, track(new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.035 }))));
  }

  // Étiquettes : rubriques, recherches et pages qui comptent le plus.
  const labels: Label[] = [];
  if (detail === "full") {
    sections.slice(0, 12).forEach((s) => labels.push({ kind: "section", text: s.name, sub: `${s.pages} page${s.pages > 1 ? "s" : ""}`, pos: sectionDirs.get(s.name)!.clone().multiplyScalar(R + 0.4), weight: s.impressions }));
    queries.slice(0, 12).forEach((q) => {
      const it = items.find((x) => x.kind === "query" && x.data === q)!;
      labels.push({ kind: "query", text: q.q, sub: `pos. ${q.position.toLocaleString("fr-CH")}`, pos: it.pos, weight: q.impressions });
    });
  }

  return {
    group,
    core,
    points,
    items,
    labels,
    sectionDirs,
    pageDirs,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}

export function lights(scene: THREE.Scene) {
  scene.add(new THREE.AmbientLight("#ffffff", 0.55));
  const sun = new THREE.DirectionalLight("#ffffff", 1.4);
  sun.position.set(30, 20, 40);
  scene.add(sun);
  const rim = new THREE.DirectionalLight("#7fe3a0", 0.5);
  rim.position.set(-40, -10, -30);
  scene.add(rim);
}

export function makeRenderer(width: number, height: number) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.setClearColor(0x000000, 0);
  return renderer;
}

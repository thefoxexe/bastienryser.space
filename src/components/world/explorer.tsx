"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Search, X } from "lucide-react";
import type { World } from "@/lib/web-world";
import { createCluster, makeRenderer, stars, type Item } from "./engine";

const nf = (v: number) => new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 1 }).format(v);

type Tip = { x: number; y: number; item: Item; flip: boolean };

/** Nuage complet des recherches d'un site : on tourne, on zoome, on survole chaque recherche. */
export default function WorldExplorer({ world }: { world: World }) {
  const box = useRef<HTMLDivElement>(null);
  const api = useRef<{ fly: (target: THREE.Vector3, dist: number) => void; focus: (item: Item | null) => void; centers: Map<string, THREE.Vector3>; items: Item[] } | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [query, setQuery] = useState("");
  const [panel, setPanel] = useState(false);

  useEffect(() => {
    const el = box.current!;
    const renderer = makeRenderer(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const sky = stars();
    scene.add(sky);
    const cluster = createCluster(world, { words: 70, dots: 600, pixelRatio: renderer.getPixelRatio(), titles: true });
    scene.add(cluster.group);
    const camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.3, 900);
    camera.position.set(0, cluster.radius * 0.3, cluster.radius * 1.75);
    // Grand écran : le nuage est centré dans l'espace libre, à gauche du panneau.
    const offset = () => {
      if (el.clientWidth >= 1024) camera.setViewOffset(el.clientWidth + 330, el.clientHeight, 330, 0, el.clientWidth, el.clientHeight);
      else camera.clearViewOffset();
    };
    offset();

    // Anneau qui entoure la recherche choisie.
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.78, 48), new THREE.MeshBasicMaterial({ color: "#28c157", transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthTest: false }));
    ring.visible = false;
    scene.add(ring);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = true;
    controls.minDistance = 3;
    controls.maxDistance = cluster.radius * 5;
    controls.autoRotate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    controls.autoRotateSpeed = 0.45;
    controls.addEventListener("start", () => (controls.autoRotate = false));

    // Vol de caméra vers un amas ou une recherche.
    let flight: { fromCam: THREE.Vector3; toCam: THREE.Vector3; fromTarget: THREE.Vector3; toTarget: THREE.Vector3; t: number } | null = null;
    const fly = (target: THREE.Vector3, dist: number) => {
      controls.autoRotate = false;
      const dir = camera.position.clone().sub(controls.target).normalize();
      flight = { fromCam: camera.position.clone(), toCam: target.clone().add(dir.multiplyScalar(dist)), fromTarget: controls.target.clone(), toTarget: target.clone(), t: 0 };
    };
    const focus = (item: Item | null) => {
      ring.visible = !!item;
      if (item) ring.position.copy(item.pos);
    };
    api.current = { fly, focus, centers: cluster.centers, items: cluster.items };

    // Survol : l'élément le plus proche du pointeur, à l'écran, et tourné vers nous.
    const proj = new THREE.Vector3();
    const nearest = (cx: number, cy: number) => {
      const r = renderer.domElement.getBoundingClientRect();
      let best: { d: number; item: Item; x: number; y: number } | null = null;
      for (const item of cluster.items) {
        proj.copy(item.pos).project(camera);
        if (proj.z > 1) continue;
        const x = ((proj.x + 1) / 2) * r.width;
        const y = ((1 - proj.y) / 2) * r.height;
        const d = Math.hypot(x - (cx - r.left), y - (cy - r.top));
        if (d < 16 && (!best || d < best.d)) best = { d, item, x, y };
      }
      return best;
    };
    const onMove = (e: PointerEvent) => {
      if (e.buttons) return;
      const b = nearest(e.clientX, e.clientY);
      setTip(b ? { x: b.x, y: b.y, item: b.item, flip: b.x > el.clientWidth * 0.6 } : null);
      renderer.domElement.style.cursor = b ? "pointer" : "grab";
    };
    let down = { x: 0, y: 0 };
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
      const b = nearest(e.clientX, e.clientY);
      setTip(b ? { x: b.x, y: b.y, item: b.item, flip: b.x > el.clientWidth * 0.6 } : null);
      focus(b?.item ?? null);
    };
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      if (flight) {
        flight.t = Math.min(1, flight.t + 0.03);
        const k = 1 - Math.pow(1 - flight.t, 3);
        camera.position.lerpVectors(flight.fromCam, flight.toCam, k);
        controls.target.lerpVectors(flight.fromTarget, flight.toTarget, k);
        if (flight.t >= 1) flight = null;
      }
      controls.update();
      sky.rotation.y += 0.00008;
      ring.lookAt(camera.position);
      renderer.render(scene, camera);
    };
    loop();
    const ro = new ResizeObserver(() => {
      renderer.setSize(el.clientWidth, el.clientHeight);
      camera.aspect = el.clientWidth / el.clientHeight;
      offset();
      camera.updateProjectionMatrix();
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      cluster.dispose();
      ring.geometry.dispose();
      (ring.material as THREE.Material).dispose();
      sky.geometry.dispose();
      (sky.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [world]);

  const matches = query.trim()
    ? world.queries.filter((q) => q.q.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 12)
    : world.queries.slice(0, 12);
  const goQuery = (q: (typeof world.queries)[number]) => {
    const item = api.current?.items.find((i) => i.data === q);
    if (!item || !api.current) return;
    api.current.fly(item.pos, 9);
    api.current.focus(item);
    setTip(null);
    setPanel(false);
  };
  const goSection = (name: string) => {
    const center = api.current?.centers.get(name);
    if (!center || !api.current) return;
    api.current.fly(center, 22);
    api.current.focus(null);
    setPanel(false);
  };
  const t = world.totals;

  return (
    <div className="relative h-[calc(100dvh-230px)] min-h-[540px] overflow-hidden rounded-[22px] bg-[#050607] text-white">
      <div ref={box} className="absolute inset-0 touch-none" />

      {/* Chiffres */}
      <div className="pointer-events-none absolute left-4 top-4 max-w-[60%] sm:left-6 sm:top-6">
        <p className="text-[12px] uppercase tracking-[0.12em] text-white/50">Tes recherches Google · {world.period}</p>
        <h2 className="mt-1 truncate text-[22px] font-semibold tracking-[-0.02em] sm:text-[28px]">{world.domain}</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-[12px] sm:grid-cols-4">
          {[
            ["Affichages", nf(t.impressions)],
            ["Clics", nf(t.clicks)],
            ["Recherches", nf(t.queries)],
            ["Dans le top 10", nf(t.top10)],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-white/50">{k}</dt>
              <dd className="tabular text-[17px] font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Bouton panneau (mobile) */}
      <button
        type="button"
        onClick={() => setPanel((p) => !p)}
        className="absolute right-4 top-4 flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3.5 text-[13px] font-medium backdrop-blur hover:bg-white/15 lg:hidden"
      >
        {panel ? <X className="size-4" /> : <Search className="size-4" />} {panel ? "Fermer" : "Explorer"}
      </button>

      {/* Panneau : chercher une recherche, aller sur un continent */}
      <aside
        className={`absolute bottom-4 right-4 top-16 w-[300px] max-w-[calc(100%-32px)] flex-col gap-4 overflow-y-auto rounded-[18px] bg-white/[0.06] p-4 backdrop-blur-xl lg:top-6 lg:flex ${panel ? "flex" : "hidden"}`}
      >
        <label className="flex h-9 items-center gap-2 rounded-full bg-white/10 px-3 text-[13px]">
          <Search className="size-4 text-white/50" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Chercher une recherche…" className="w-full bg-transparent outline-none placeholder:text-white/40" />
        </label>
        <div>
          <p className="mb-1.5 text-[11px] uppercase tracking-[0.1em] text-white/45">{query ? "Résultats" : "Recherches qui t'affichent le plus"}</p>
          <ul className="flex flex-col">
            {matches.map((q) => (
              <li key={q.q}>
                <button type="button" onClick={() => goQuery(q)} className="flex w-full items-center gap-2 rounded-[10px] px-2 py-1.5 text-left hover:bg-white/10">
                  <span className={`size-2 shrink-0 rounded-full ${q.clicks > 0 ? "bg-green" : q.position <= 10 ? "bg-white" : "bg-white/35"}`} />
                  <span className="min-w-0 flex-1 truncate text-[13px]">{q.q}</span>
                  <span className="tabular shrink-0 text-[11px] text-white/50">#{nf(q.position)}</span>
                </button>
              </li>
            ))}
            {!matches.length ? <li className="px-2 text-[13px] text-white/50">Aucune recherche ne correspond.</li> : null}
          </ul>
        </div>
        <div>
          <p className="mb-1.5 text-[11px] uppercase tracking-[0.1em] text-white/45">Amas (rubriques du site)</p>
          <ul className="flex flex-col">
            {world.sections.filter((s) => world.queries.some((q) => q.section === s.name)).slice(0, 10).map((s) => (
              <li key={s.name}>
                <button type="button" onClick={() => goSection(s.name)} className="flex w-full items-baseline gap-2 rounded-[10px] px-2 py-1.5 text-left hover:bg-white/10">
                  <span className="min-w-0 flex-1 truncate text-[13px] capitalize">{s.name}</span>
                  <span className="tabular shrink-0 text-[11px] text-white/50">
                    {nf(s.impressions)} · {s.pages} p.
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        {t.unseen ? (
          <p className="text-[11px] leading-relaxed text-white/45">
            {t.unseen} page{t.unseen > 1 ? "s" : ""} du sitemap jamais montrée{t.unseen > 1 ? "s" : ""} par Google sur 90 jours.
          </p>
        ) : null}
      </aside>

      {/* Légende */}
      <div className="pointer-events-none absolute bottom-4 left-4 flex max-w-[calc(100%-32px)] flex-wrap gap-x-4 gap-y-1 rounded-full bg-black/40 px-3.5 py-1.5 text-[11px] text-white/70 backdrop-blur sm:left-6">
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-green" />a apporté des clics</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-white" />top 10</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-white/35" />plus loin</span>
        <span>taille = affichages · près du cœur = bien classé</span>
      </div>

      {/* Infobulle */}
      {tip ? (
        <div
          className="pointer-events-none absolute z-10 max-w-[260px] rounded-[12px] bg-white px-3 py-2 text-[12px] text-black shadow-xl"
          style={{ left: tip.x, top: tip.y, transform: `translate(${tip.flip ? "-105%" : "12px"}, -50%)` }}
        >
          <p className="font-semibold">« {tip.item.data.q} »</p>
          <p className="tabular mt-0.5 text-black/70">
            {nf(tip.item.data.impressions)} affichages · {nf(tip.item.data.clicks)} clics · position {nf(tip.item.data.position)}
          </p>
          <p className="mt-0.5 truncate text-black/50">→ {tip.item.data.page}</p>
        </div>
      ) : null}
    </div>
  );
}

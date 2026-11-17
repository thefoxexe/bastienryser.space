"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { World } from "@/lib/web-world";
import { createCluster, makeRenderer, stars, type Cluster } from "./engine";

const nf = (v: number) => new Intl.NumberFormat("fr-CH", { notation: v >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(v);

/** Tous les sites en orbite, chacun un nuage de recherches à sa taille réelle sur Google ; un clic plonge dedans. */
export default function Universe({ worlds, full = false }: { worlds: World[]; full?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const router = useRouter();
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current!;
    const { clientWidth: w, clientHeight: h } = el;
    const renderer = makeRenderer(w, h);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    if (full) scene.add(stars());
    const camera = new THREE.PerspectiveCamera(40, w / h, 1, 800);
    camera.position.set(0, full ? 50 : 46, full ? 128 : 134);
    camera.lookAt(0, -15, 0);

    // Les planètes sur une orbite commune, taille selon les affichages Google (racine, pour garder les petits visibles).
    const orbit = new THREE.Group();
    scene.add(orbit);
    const max = Math.max(1, ...worlds.map((x) => x.totals.impressions));
    const ring = 46 + worlds.length * 3;
    const planets: { planet: Cluster; holder: THREE.Group; scale: number }[] = worlds.map((world, i) => {
      const planet = createCluster(world, { words: 10, dots: 200, pixelRatio: renderer.getPixelRatio(), titles: false });
      const holder = new THREE.Group();
      const scale = ((0.5 + 0.5 * Math.sqrt(world.totals.impressions / max)) * 19) / planet.radius;
      holder.scale.setScalar(scale);
      const a = (i / worlds.length) * Math.PI * 2;
      holder.position.set(Math.cos(a) * ring, 0, Math.sin(a) * ring);
      holder.add(planet.group);
      planet.hit.userData.index = i;
      orbit.add(holder);
      return { planet, holder, scale };
    });
    const circle = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(Array.from({ length: 160 }, (_, i) => new THREE.Vector3(Math.cos((i / 160) * Math.PI * 2) * ring, 0, Math.sin((i / 160) * Math.PI * 2) * ring))),
      new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.08 }),
    );
    scene.add(circle);

    const controls = full ? new OrbitControls(camera, renderer.domElement) : null;
    if (controls) {
      controls.enableDamping = true;
      controls.enablePan = false;
      controls.minDistance = 30;
      controls.maxDistance = 220;
      controls.target.set(0, -15, 0);
    }

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let hovered: number | null = null;
    const pick = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(mouse, camera);
      const hit = raycaster.intersectObjects(planets.map((p) => p.planet.hit))[0];
      return hit ? (hit.object.userData.index as number) : null;
    };
    const onMove = (e: PointerEvent) => {
      hovered = pick(e);
      setHover(hovered);
      renderer.domElement.style.cursor = hovered !== null ? "pointer" : full ? "grab" : "default";
    };
    let down = { x: 0, y: 0 };
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return; // glissement, pas un clic
      const i = pick(e);
      if (i !== null) router.push(`/b/${worlds[i].slug}/monde`);
    };
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let visible = true;
    let frame = 0;
    const v = new THREE.Vector3();
    const loop = () => {
      frame = requestAnimationFrame(loop);
      if (!visible) return;
      if (!still) {
        orbit.rotation.y += 0.0009;
        planets.forEach((p, i) => (p.planet.group.rotation.y += 0.004 + i * 0.0007));
      }
      planets.forEach((p, i) => {
        const target = hovered === i ? p.scale * 1.12 : p.scale;
        p.holder.scale.setScalar(p.holder.scale.x + (target - p.holder.scale.x) * 0.15);
        // Étiquette sous la planète.
        const label = labelRefs.current[i];
        if (!label) return;
        p.holder.getWorldPosition(v);
        v.y -= p.planet.radius * p.holder.scale.x * 1.05;
        v.project(camera);
        label.style.transform = `translate(-50%, 0) translate(${((v.x + 1) / 2) * el.clientWidth}px, ${((1 - v.y) / 2) * el.clientHeight}px)`;
        label.style.opacity = v.z < 1 ? "1" : "0";
      });
      controls?.update();
      renderer.render(scene, camera);
    };
    loop();
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(el);
    const ro = new ResizeObserver(() => {
      renderer.setSize(el.clientWidth, el.clientHeight);
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
      ro.disconnect();
      controls?.dispose();
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      planets.forEach((p) => p.planet.dispose());
      circle.geometry.dispose();
      (circle.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [worlds, full, router]);

  return (
    <div className="relative size-full overflow-hidden">
      <div ref={box} className="absolute inset-0" />
      {worlds.map((w, i) => (
        <div
          key={w.slug}
          ref={(n) => {
            labelRefs.current[i] = n;
          }}
          className="pointer-events-none absolute left-0 top-0 whitespace-nowrap text-center transition-opacity"
        >
          <p className={`text-[13px] font-semibold text-white ${hover === i ? "underline" : ""}`}>{w.name}</p>
          <p className="tabular text-[11px] text-white/55">{nf(w.totals.impressions)} affichages · {nf(w.totals.clicks)} clics</p>
        </div>
      ))}
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import * as THREE from "three";
import type { World } from "@/lib/web-world";
import { createPlanet, lights, makeRenderer, R } from "./engine";

/** Petite planète qui tourne (aperçu d'un business) ; un clic ouvre le monde complet. */
export default function PlanetMini({ world, href }: { world: World; href: string }) {
  const box = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const el = box.current!;
    const { clientWidth: w, clientHeight: h } = el;
    const renderer = makeRenderer(w, h);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    lights(scene);
    const camera = new THREE.PerspectiveCamera(35, w / h, 1, 400);
    camera.position.set(0, 7, R * 4.5);
    camera.lookAt(0, 0, 0);
    const planet = createPlanet(world, "mini", renderer.getPixelRatio());
    planet.group.rotation.z = 0.18;
    scene.add(planet.group);

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let visible = true;
    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      if (!visible) return;
      if (!still) planet.group.rotation.y += 0.0022;
      renderer.render(scene, camera);
    };
    loop();
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(el);
    const ro = new ResizeObserver(() => {
      const { clientWidth, clientHeight } = el;
      renderer.setSize(clientWidth, clientHeight);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
      ro.disconnect();
      planet.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [world]);

  return (
    <div
      ref={box}
      role="link"
      tabIndex={0}
      aria-label={`Ouvrir le monde de ${world.name} sur Google`}
      onClick={() => router.push(href)}
      onKeyDown={(e) => e.key === "Enter" && router.push(href)}
      className="size-full cursor-pointer"
    />
  );
}

"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import * as THREE from "three";
import type { World } from "@/lib/web-world";
import { createCluster, declutter, makeRenderer } from "./engine";

/** Petit nuage de recherches qui tourne (aperçu d'un business) ; un clic ouvre le nuage complet. */
export default function PlanetMini({ world, href }: { world: World; href: string }) {
  const box = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const el = box.current!;
    const renderer = makeRenderer(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const cluster = createCluster(world, { words: 12, dots: 240, pixelRatio: renderer.getPixelRatio(), titles: false });
    scene.add(cluster.group);
    scene.fog = new THREE.Fog(0x050607, cluster.radius * 0.9, cluster.radius * 2.6);
    const camera = new THREE.PerspectiveCamera(40, el.clientWidth / el.clientHeight, 0.5, 600);
    camera.position.set(0, cluster.radius * 0.35, cluster.radius * 1.55);
    camera.lookAt(0, 0, 0);

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let visible = true;
    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      if (!visible) return;
      if (!still) cluster.group.rotation.y += 0.0025;
      declutter(cluster.words, camera, el.clientWidth, el.clientHeight);
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
      cluster.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [world]);

  return (
    <div
      ref={box}
      role="link"
      tabIndex={0}
      aria-label={`Ouvrir le nuage de recherches de ${world.name}`}
      onClick={() => router.push(href)}
      onKeyDown={(e) => e.key === "Enter" && router.push(href)}
      className="size-full cursor-pointer"
    />
  );
}

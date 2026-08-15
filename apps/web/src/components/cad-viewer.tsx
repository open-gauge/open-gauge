"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsType } from "three/addons/controls/OrbitControls.js";
import { loadCadFile, isCadPreviewable } from "@/lib/cad-loader";

const MODEL_COLOR = 0x2f819b;

interface CadViewerProps {
  url: string;
  filename: string;
  className?: string;
}

type ViewerStatus = "loading" | "ready" | "unsupported" | "error";

/** Renders an STL/STEP/IGES/BREP file into an orbit-controlled 3D canvas. */
export function CadViewer({ url, filename, className }: CadViewerProps) {
  const t = useTranslations("assets.cad");
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<ViewerStatus>("loading");

  useEffect(() => {
    if (!isCadPreviewable(filename)) {
      setStatus("unsupported");
      return;
    }
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControlsType | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let frameId = 0;
    const disposables: Array<{ dispose: () => void }> = [];

    async function run() {
      setStatus("loading");
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("download failed");
        const buf = await res.arrayBuffer();
        const { meshes } = await loadCadFile(filename, buf);
        if (cancelled || !container) return;

        const scene = new THREE.Scene();
        const group = new THREE.Group();
        const defaultMaterial = new THREE.MeshStandardMaterial({ color: MODEL_COLOR, metalness: 0.15, roughness: 0.55 });
        disposables.push(defaultMaterial);
        for (const m of meshes) {
          const material = m.color
            ? new THREE.MeshStandardMaterial({ color: m.color, metalness: 0.15, roughness: 0.55 })
            : defaultMaterial;
          if (material !== defaultMaterial) disposables.push(material);
          disposables.push(m.geometry);
          group.add(new THREE.Mesh(m.geometry, material));
        }

        const box = new THREE.Box3().setFromObject(group);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        group.position.sub(center);
        scene.add(group);

        const maxDim = Math.max(size.x, size.y, size.z, 1e-6);
        const width = container.clientWidth || 1;
        const height = container.clientHeight || 1;
        const camera = new THREE.PerspectiveCamera(45, width / height, maxDim / 1000, maxDim * 100);
        camera.position.set(maxDim * 1.1, maxDim * 0.9, maxDim * 1.1);
        camera.lookAt(0, 0, 0);

        scene.add(new THREE.AmbientLight(0xffffff, 0.7));
        const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
        keyLight.position.set(maxDim, maxDim * 2, maxDim);
        scene.add(keyLight);
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.35);
        fillLight.position.set(-maxDim, -maxDim * 0.5, -maxDim);
        scene.add(fillLight);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(width, height);
        container.replaceChildren(renderer.domElement);

        const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");
        if (cancelled) return;
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.target.set(0, 0, 0);

        const animate = () => {
          frameId = requestAnimationFrame(animate);
          controls?.update();
          if (renderer) renderer.render(scene, camera);
        };
        animate();

        resizeObserver = new ResizeObserver(() => {
          if (!renderer || !container) return;
          const w = container.clientWidth || 1;
          const h = container.clientHeight || 1;
          renderer.setSize(w, h);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        });
        resizeObserver.observe(container);

        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }
    run();

    return () => {
      cancelled = true;
      if (frameId) cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      controls?.dispose();
      renderer?.dispose();
      for (const d of disposables) d.dispose();
      container.replaceChildren();
    };
  }, [url, filename]);

  return (
    <div className={`relative ${className ?? ""}`}>
      <div ref={containerRef} className="w-full h-full" />
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-og-surface-alt/60">
          <span className="w-6 h-6 border-2 border-og-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {status === "unsupported" && (
        <div className="absolute inset-0 flex items-center justify-center px-4 text-center bg-og-surface-alt">
          <p className="text-xs text-gray-400">{t("previewUnavailable")}</p>
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center px-4 text-center bg-og-surface-alt">
          <p className="text-xs text-red-500">{t("previewFailed")}</p>
        </div>
      )}
    </div>
  );
}

"use client";

/**
 * Parses an uploaded CAD file into three.js-ready geometry.
 *
 * STL is parsed directly with three.js's own STLLoader (cheap, no WASM).
 * STEP/IGES/BREP go through occt-import-js, an Emscripten build of the
 * OpenCascade B-rep kernel — the only way to triangulate those formats in a
 * browser. Its ~11MB WASM binary is only fetched the first time a non-STL
 * file is actually viewed (dynamic import), and the initialized instance is
 * cached so it isn't reloaded for every CAD viewer on the page.
 */
import * as THREE from "three";

export interface CadMesh {
  geometry: THREE.BufferGeometry;
  color: THREE.Color | null;
}

export interface CadLoadResult {
  meshes: CadMesh[];
}

const OCCT_READERS: Record<string, "ReadStepFile" | "ReadIgesFile" | "ReadBrepFile"> = {
  step: "ReadStepFile",
  stp: "ReadStepFile",
  iges: "ReadIgesFile",
  igs: "ReadIgesFile",
  brep: "ReadBrepFile",
};

function extOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

export function isCadPreviewable(filename: string): boolean {
  const ext = extOf(filename);
  return ext === "stl" || ext in OCCT_READERS;
}

interface OcctMesh {
  color?: [number, number, number];
  attributes: { position: { array: number[] }; normal?: { array: number[] } };
  index: { array: number[] };
}

interface OcctResult {
  success: boolean;
  meshes: OcctMesh[];
}

interface OcctModule {
  ReadStepFile(bytes: Uint8Array, params: null): OcctResult;
  ReadIgesFile(bytes: Uint8Array, params: null): OcctResult;
  ReadBrepFile(bytes: Uint8Array, params: null): OcctResult;
}

let occtPromise: Promise<OcctModule> | null = null;

async function getOcct(): Promise<OcctModule> {
  if (!occtPromise) {
    occtPromise = (async () => {
      const factory = (await import("occt-import-js")).default as unknown as (opts: {
        wasmBinary: ArrayBuffer;
      }) => Promise<OcctModule>;
      // Fetched from public/wasm/ (see scripts/copy-occt-wasm.mjs) rather than resolved via
      // `new URL("occt-import-js/dist/...", import.meta.url)` — that bundler-asset pattern
      // isn't reliably picked up by Turbopack production builds, so this app serves the
      // binary from a plain static URL and hands it to Emscripten directly as `wasmBinary`,
      // skipping its own fetch/locateFile logic entirely.
      const wasmRes = await fetch("/wasm/occt-import-js.wasm");
      if (!wasmRes.ok) throw new Error("Could not load the CAD engine (occt-import-js.wasm)");
      const wasmBinary = await wasmRes.arrayBuffer();
      return factory({ wasmBinary });
    })();
  }
  return occtPromise;
}

export async function loadCadFile(filename: string, data: ArrayBuffer): Promise<CadLoadResult> {
  const ext = extOf(filename);

  if (ext === "stl") {
    const { STLLoader } = await import("three/addons/loaders/STLLoader.js");
    const geometry = new STLLoader().parse(data);
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
    return { meshes: [{ geometry, color: null }] };
  }

  const reader = OCCT_READERS[ext];
  if (!reader) {
    throw new Error(`Unsupported CAD format: .${ext}`);
  }

  const occt = await getOcct();
  const result = occt[reader](new Uint8Array(data), null);
  if (!result.success || !result.meshes?.length) {
    throw new Error("Could not parse CAD file");
  }

  const meshes: CadMesh[] = result.meshes.map((m) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(m.attributes.position.array, 3));
    if (m.attributes.normal) {
      geometry.setAttribute("normal", new THREE.Float32BufferAttribute(m.attributes.normal.array, 3));
    }
    geometry.setIndex(m.index.array);
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
    return {
      geometry,
      color: m.color ? new THREE.Color(m.color[0], m.color[1], m.color[2]) : null,
    };
  });

  return { meshes };
}

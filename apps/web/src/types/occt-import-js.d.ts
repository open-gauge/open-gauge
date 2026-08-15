// occt-import-js ships no type declarations (see its README) — this ambient
// module keeps `import("occt-import-js")` a compile error away from `any`.
// The real, narrower shape used by this app is in src/lib/cad-loader.ts.
declare module "occt-import-js" {
  type OcctFactory = (opts?: { locateFile?: (path: string) => string }) => Promise<unknown>;
  const occtimportjs: OcctFactory;
  export default occtimportjs;
}

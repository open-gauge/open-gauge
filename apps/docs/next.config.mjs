import { createMDX } from "fumadocs-mdx/next";

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // Fully static build for Cloudflare Pages — see src/app/api/search/route.ts
  // for the one runtime feature (search) this requires swapping to build-time.
  output: "export",
};

const withMDX = createMDX();

export default withMDX(config);

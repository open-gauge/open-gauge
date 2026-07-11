import nextConfig from "eslint-config-next";

const config = [
  { ignores: [".source/**", ".next/**", "content/docs/api/**"] },
  ...nextConfig,
];

export default config;

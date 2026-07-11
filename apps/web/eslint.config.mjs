import nextConfig from "eslint-config-next";

const config = [
  { ignores: [".next/**"] },
  ...nextConfig,
  {
    rules: {
      // New in eslint-plugin-react-hooks v6 (shipped with Next 16's config): flags the
      // long-standing, still-correct "sync from an external source on mount" effect pattern
      // (localStorage reads, fetch-on-mount, debounced search) used throughout this app.
      // Advisory, not a correctness issue — keep visible as a warning rather than blocking
      // the build over a large pre-existing pattern unrelated to the Next/React upgrade.
      "react-hooks/set-state-in-effect": "warn",
      // Same story: flags the "keep a ref in sync, read it during a lazy useState
      // initializer / render" pattern already in use (e.g. stable per-item key counters).
      // Works correctly today; not something to rewrite as a side effect of this upgrade.
      "react-hooks/refs": "warn",
    },
  },
];

export default config;

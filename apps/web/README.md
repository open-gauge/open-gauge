This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Live demo build (demo.opengauge.org)

This same codebase also builds a fully static, backend-free "demo mode" —
seeded with a fictional 50-asset calibration lab, no API/database required —
deployed at [demo.opengauge.org](https://demo.opengauge.org).

```bash
npm run build:demo
npx serve out    # local preview of the static export
```

`build:demo` sets `NEXT_PUBLIC_DEMO_MODE=true` and runs `next build` with
`output: "export"` (see `next.config.mjs`). In demo mode:

- Every network call in `services/*.ts` is transparently answered by an
  in-browser mock REST layer (`src/lib/demo/router.ts` + `store.ts`) instead
  of a real backend — see the comments at the top of `store.ts` for how
  session-only writes work (nothing persists past a hard reload).
- Login is skipped — visitors land straight on `/dashboard` as a fixed demo
  user.
- The in-app API Reference (which needs a live OpenAPI schema) is dropped;
  the Guide/Knowledge Center pages stay static as-is. The full API reference
  still lives permanently at [docs.opengauge.org](https://docs.opengauge.org).

**Regenerating the fixture data.** The dataset is a committed snapshot
(`src/lib/demo/fixtures/data.json`), not regenerated on every build — the
same pattern `apps/docs/openapi.json` uses. To refresh it (e.g. after a
schema change):

```bash
node scripts/generate-demo-data.mjs
```

**Cloudflare Pages setup** (one-time, mirrors the existing
`docs.opengauge.org` project — dashboard-driven, no `wrangler.toml`/CI step):

1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**
   → `open-gauge/open-gauge`.
2. Framework preset: `None`. Root directory: `apps/web`.
3. Build command: `npm run build:demo`. Build output directory: `out`.
4. Deploy, then add the custom domain `demo.opengauge.org` under
   *Custom domains*.

Cloudflare rebuilds automatically on every push to `main`, so the demo always
tracks the latest UI — no separate deploy workflow needed.

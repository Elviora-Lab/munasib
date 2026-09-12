# Analytics API keys (Munasib migration)

Which third-party keys this app needs, which are Munasib's to obtain, and why
none of them are needed for local development.

This is the umbrella doc. Per-service detail lives in
[`google-analytics.md`](./google-analytics.md),
[`meta-ads-dashboard.md`](./meta-ads-dashboard.md), and
[`clickstream-and-demographics-plan.md`](./clickstream-and-demographics-plan.md).

## TL;DR

- **Local dev needs zero analytics keys.** Leave every var below blank; the app
  runs fine and no tracker loads.
- All gating keys off `NEXT_PUBLIC_ENVIRONMENT` (**not** `NODE_ENV`). Your `.env`
  sets `development`, so every browser tracker is inert.
- Two Elviora IDs used to be hardcoded as schema defaults. They have been
  removed — see [Fixed: hardcoded Elviora IDs](#fixed-hardcoded-elviora-ids).

## Keys to obtain for Munasib

Set these in the production environment (Vercel project settings) only.

### Meta — Business Manager → Munasib assets

| Variable                    | Where to get it                                   | Required for                |
| --------------------------- | ------------------------------------------------- | --------------------------- |
| `NEXT_PUBLIC_FB_PIXEL_ID`   | Events Manager → new Munasib pixel                | Browser pixel               |
| `META_CAPI_ACCESS_TOKEN`    | Events Manager → Settings → Conversions API token | Server-side events          |
| `META_CAPI_TEST_EVENT_CODE` | Events Manager → Test events tab                  | Optional, temporary         |
| `META_ADS_ACCESS_TOKEN`     | System User token with `ads_read`                 | `/admin/ads` dashboard only |
| `META_ADS_ACCOUNT_ID`       | Ad account id (digits, or with `act_` prefix)     | `/admin/ads` dashboard only |

### Google Analytics 4 — new GA4 property for Munasib

| Variable             | Where to get it                                               | Required for                 |
| -------------------- | ------------------------------------------------------------- | ---------------------------- |
| `NEXT_PUBLIC_GA_ID`  | Admin → Data Streams → Web → Measurement ID (`G-XXXXXXX`)     | Browser GA4                  |
| `GA_API_SECRET`      | Admin → Data Streams → Web → Measurement Protocol API secrets | Server-side purchase/refund  |
| `GA_PROPERTY_ID`     | Admin → Property Settings (numeric)                           | `/admin/analytics` reporting |
| `GA_SA_CLIENT_EMAIL` | GCP service account, granted Viewer on the property           | `/admin/analytics` reporting |
| `GA_SA_PRIVATE_KEY`  | Same service account key (keep the literal `\n` escapes)      | `/admin/analytics` reporting |

### Microsoft Clarity

| Variable                 | Where to get it             | Required for              |
| ------------------------ | --------------------------- | ------------------------- |
| `NEXT_PUBLIC_CLARITY_ID` | New Munasib Clarity project | Session replay + heatmaps |

> This var was never present in any `.env` file — which is exactly why the
> hardcoded default silently governed it.

### Not needed

`NEXT_PUBLIC_GTM_ID` is **dead config**. Nothing in the app loads a GTM
container; GA4 loads directly via `gtag.js`. It is referenced only in
`src/config/env.ts`. Safe to drop.

## Why local dev is already clean

Gating is centralized in `src/config/env.ts`, which exports `isProd` /`isDev`
derived from `NEXT_PUBLIC_ENVIRONMENT === 'production'`. Every tracker checks it:

| Tracker                  | File                                                 | Gate                |
| ------------------------ | ---------------------------------------------------- | ------------------- |
| Meta Pixel               | `src/lib/analytics/meta-pixel.ts:22`                 | `isProd && pixelId` |
| Microsoft Clarity        | `src/components/analytics/clarity.tsx:15`            | `!isProd → null`    |
| Google Analytics 4       | `src/lib/analytics/google.ts:23`                     | `isProd && GA_ID`   |
| Meta CAPI (server)       | `src/server/analytics/meta-capi.ts:22`               | `isProd && token`   |
| GA4 Measurement Protocol | `src/server/analytics/ga-measurement-protocol.ts:24` | `isProd && secret`  |
| First-party clickstream  | `src/lib/analytics/clickstream.ts:26`                | `isProd`            |

Admin read-only dashboards (Meta Ads, GA4 Data API) gate on **credential
presence only**, not `isProd` — they read data, they never write events.

`NODE_ENV` is used in only two places: `next.config.ts:13` (dev-only CSP
`'unsafe-eval'`) and `src/store/index.ts:29` (Redux devtools).

### Debug flags

`NEXT_PUBLIC_GA_DEBUG=true` no longer bypasses the production gate. It only adds
`debug_mode` after GA has already passed the production-only check. Likewise,
`NEXT_PUBLIC_FB_PIXEL_DEBUG=true` never loads Meta Pixel or CAPI locally.

Local development should stay quiet even if someone accidentally leaves a debug
flag in `.env`.

## Fixed: hardcoded Elviora IDs

Two production IDs belonging to Elviora were baked in as Zod schema defaults, so
they would fire on any build flagged `production` even with a completely empty
`.env`:

- `src/config/env.ts:27` — Meta Pixel `1197005882688887`
- `src/config/env.ts:22` — Clarity project `xleyclgkht`

Both defaults were removed and the fields are now `optionalStr`. An unset value
now means _no tracking_ rather than _Elviora's tracking_. The existing guards
(`Boolean(FB_PIXEL_ID)` and `!id`) already handled `undefined`, so no call sites
changed; `tsc --noEmit` passes.

**Consequence:** production will now send nothing until the Munasib IDs above
are actually set. That is intentional — silence beats cross-store contamination.

## Known gap (not fixed here)

Consent Mode v2 grants **all** storage signals by default with no consent
management platform (`src/components/analytics/google-analytics.tsx:59`). This is
acknowledged in that file's own comment. It needs a cookie banner before serving
EU/UK traffic.

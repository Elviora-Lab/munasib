import { z } from 'zod';

// Treat empty strings ("FOO=" in .env) as "not set". Zod `.url()` etc.
// reject empty strings outright, which surprises users on Vercel where
// unset secrets often serialize as "".
const emptyToUndef = (v: unknown) => (v === '' ? undefined : v);
const optionalUrl = z.preprocess(emptyToUndef, z.string().url().optional());
const optionalStr = z.preprocess(emptyToUndef, z.string().optional());
const apiUrl = z.preprocess(emptyToUndef, z.string().default('/api/v1'));

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_SITE_NAME: z.string().default('Munasib'),
  NEXT_PUBLIC_API_URL: apiUrl,
  NEXT_PUBLIC_CDN_URL: optionalUrl,
  NEXT_PUBLIC_ENVIRONMENT: z.enum(['development', 'staging', 'production']).default('development'),
  NEXT_PUBLIC_GTM_ID: optionalStr,
  NEXT_PUBLIC_GA_ID: optionalStr,
  // Microsoft Clarity project id — session replay + heatmaps. Loads in
  // production only (like the pixel), and only when this is set. No default:
  // an unset value must mean "no tracking", never "some other store's project".
  NEXT_PUBLIC_CLARITY_ID: optionalStr,
  // "true" ⇒ GA4 events carry debug_mode so they show in DebugView.
  NEXT_PUBLIC_GA_DEBUG: optionalStr,
  // Meta (Facebook) Pixel ID. No default: an unset value must mean "no
  // tracking", never "some other store's pixel". Set per environment.
  NEXT_PUBLIC_FB_PIXEL_ID: optionalStr,
  // "true" ⇒ add Meta diagnostic flags in production only. Local/dev never
  // loads the real browser pixel or CAPI because those hit production Meta
  // infrastructure even from localhost.
  NEXT_PUBLIC_FB_PIXEL_DEBUG: optionalStr,
  // First-party clickstream: optional sampling rate (0–1) applied to each click
  // before it's queued — a safety valve if volume ever spikes. Unset/invalid ⇒
  // 1 (capture all). Capture itself is production-only (gated on the environment,
  // like the pixel) — there is intentionally no public "enable in dev" flag.
  NEXT_PUBLIC_CLICKSTREAM_SAMPLE: optionalStr,
  NEXT_PUBLIC_SENTRY_DSN: optionalStr,
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: optionalStr,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: optionalStr,
  NEXT_PUBLIC_FIREBASE_API_KEY: optionalStr,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: optionalStr,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: optionalStr,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: optionalStr,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: optionalStr,
  NEXT_PUBLIC_FIREBASE_APP_ID: optionalStr,
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: optionalStr,
  NEXT_PUBLIC_FIREBASE_VAPID_KEY: optionalStr,
  // Social profiles published in Organization `sameAs`. These are ENTITY
  // claims: Google uses them to decide which real-world business this domain
  // is. Only ever set a URL we actually control — a profile belonging to a
  // different business would invite Google to merge the two entities, which
  // is the exact opposite of what we need. Unset ⇒ the property is omitted
  // from the schema entirely, never guessed.
  NEXT_PUBLIC_SOCIAL_INSTAGRAM: optionalUrl,
  NEXT_PUBLIC_SOCIAL_FACEBOOK: optionalUrl,
  NEXT_PUBLIC_SOCIAL_YOUTUBE: optionalUrl,
  NEXT_PUBLIC_SOCIAL_TIKTOK: optionalUrl,
});

const serverEnvSchema = z.object({
  API_URL: optionalUrl,
  JWT_SECRET: optionalStr,
  JWT_REFRESH_SECRET: optionalStr,
  NEXTAUTH_SECRET: optionalStr,
  GOOGLE_CLIENT_SECRET: optionalStr,
  SENTRY_AUTH_TOKEN: optionalStr,
  RESEND_API_KEY: optionalStr,
  EMAIL_FROM: optionalStr,
  EMAIL_REPLY_TO: optionalStr,
  STRIPE_SECRET_KEY: optionalStr,
  STRIPE_WEBHOOK_SECRET: optionalStr,
  REDIS_URL: optionalStr,
  S3_REGION: optionalStr,
  S3_BUCKET: optionalStr,
  S3_ACCESS_KEY_ID: optionalStr,
  S3_SECRET_ACCESS_KEY: optionalStr,
  S3_PUBLIC_URL: optionalUrl,
  // S3-compatible endpoint (Supabase Storage, R2, MinIO…). Omit for AWS S3.
  S3_ENDPOINT: optionalUrl,
  OPENAI_API_KEY: optionalStr,
  // Meta Conversions API — server-side event token (Events Manager → Settings).
  // Optional test-event code routes events to the "Test events" tab while wiring.
  META_CAPI_ACCESS_TOKEN: optionalStr,
  META_CAPI_TEST_EVENT_CODE: optionalStr,
  // GA4 Measurement Protocol — server-side events (Admin → Data Streams → Web →
  // Measurement Protocol API secrets). Paired with NEXT_PUBLIC_GA_ID.
  GA_API_SECRET: optionalStr,
  // GA4 Data API (read GA metrics into /admin/analytics). Numeric property id
  // (Admin → Property Settings) + a Google Cloud service account granted Viewer
  // on the property. The private key keeps its literal "\n" escapes.
  GA_PROPERTY_ID: optionalStr,
  GA_SA_CLIENT_EMAIL: optionalStr,
  GA_SA_PRIVATE_KEY: optionalStr,
  // Meta Marketing API — read-only ad performance dashboard (/admin/ads).
  // System User token with `ads_read`, plus the ad account id (digits only, or
  // with the act_ prefix). Both unset ⇒ the dashboard shows a setup card.
  META_ADS_ACCESS_TOKEN: optionalStr,
  META_ADS_ACCOUNT_ID: optionalStr,
  // PostEx courier (Pakistan) — merchant API token + optional pickup address code.
  POSTEX_API_TOKEN: optionalStr,
  POSTEX_PICKUP_ADDRESS_CODE: optionalStr,
  // Firebase Cloud Messaging. Prefer pasting the whole service-account JSON
  // into FCM_SERVICE_ACCOUNT_JSON (Vercel-friendly). The split fields are the
  // same values as admin.credential.cert({ projectId, clientEmail, privateKey }).
  FCM_SERVICE_ACCOUNT_JSON: optionalStr,
  FCM_PROJECT_ID: optionalStr,
  FCM_CLIENT_EMAIL: optionalStr,
  FCM_PRIVATE_KEY: optionalStr,
  // Shared secret for cron endpoints (Vercel Cron sends it as a Bearer token).
  CRON_SECRET: optionalStr,
  // postgresql:// URLs are not valid http(s) URLs, so use a plain string check
  // and require the protocol prefix when set.
  DATABASE_URL: z.preprocess(
    emptyToUndef,
    z
      .string()
      .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL must start with postgres:// or postgresql://')
      .optional(),
  ),
  DIRECT_URL: z.preprocess(
    emptyToUndef,
    z
      .string()
      .regex(/^postgres(ql)?:\/\//, 'DIRECT_URL must start with postgres:// or postgresql://')
      .optional(),
  ),
});

// Public env — must reference each NEXT_PUBLIC_* var statically for Next's
// build-time replacement to work.
const publicEnvSource = {
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_SITE_NAME: process.env.NEXT_PUBLIC_SITE_NAME,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_CDN_URL: process.env.NEXT_PUBLIC_CDN_URL,
  NEXT_PUBLIC_ENVIRONMENT: process.env.NEXT_PUBLIC_ENVIRONMENT,
  NEXT_PUBLIC_GTM_ID: process.env.NEXT_PUBLIC_GTM_ID,
  NEXT_PUBLIC_GA_ID: process.env.NEXT_PUBLIC_GA_ID,
  NEXT_PUBLIC_CLARITY_ID: process.env.NEXT_PUBLIC_CLARITY_ID,
  NEXT_PUBLIC_GA_DEBUG: process.env.NEXT_PUBLIC_GA_DEBUG,
  NEXT_PUBLIC_FB_PIXEL_ID: process.env.NEXT_PUBLIC_FB_PIXEL_ID,
  NEXT_PUBLIC_FB_PIXEL_DEBUG: process.env.NEXT_PUBLIC_FB_PIXEL_DEBUG,
  NEXT_PUBLIC_CLICKSTREAM_SAMPLE: process.env.NEXT_PUBLIC_CLICKSTREAM_SAMPLE,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  NEXT_PUBLIC_FIREBASE_VAPID_KEY: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
  NEXT_PUBLIC_SOCIAL_INSTAGRAM: process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM,
  NEXT_PUBLIC_SOCIAL_FACEBOOK: process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK,
  NEXT_PUBLIC_SOCIAL_YOUTUBE: process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE,
  NEXT_PUBLIC_SOCIAL_TIKTOK: process.env.NEXT_PUBLIC_SOCIAL_TIKTOK,
};

const publicParsed = publicEnvSchema.safeParse(publicEnvSource);
if (!publicParsed.success) {
  console.error('Invalid public environment variables:', publicParsed.error.flatten().fieldErrors);
  throw new Error('Invalid public environment variables');
}

export const publicEnv = publicParsed.data;

// NEXT_PUBLIC_SITE_URL is inlined at build time and is the single source of
// every canonical, OG url, sitemap entry, robots host and JSON-LD `url`. Its
// zod default means an UNSET var builds cleanly against `http://localhost:3000`
// — which silently de-indexes the whole site. Fail the build instead.
//
// VERCEL_ENV is checked alongside NEXT_PUBLIC_ENVIRONMENT because that var has
// a default too: if both are unset on Vercel this would otherwise read as
// "development" and wave the localhost URL straight through to production.
// Server-only (`window` guard) so this never ships in the client bundle.
if (typeof window === 'undefined') {
  const isProd =
    process.env.VERCEL_ENV === 'production' || publicEnv.NEXT_PUBLIC_ENVIRONMENT === 'production';
  if (
    isProd &&
    /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/.test(publicEnv.NEXT_PUBLIC_SITE_URL)
  ) {
    throw new Error(
      `NEXT_PUBLIC_SITE_URL is "${publicEnv.NEXT_PUBLIC_SITE_URL}" in a production build. ` +
        'Set it to the real public origin (https://munasib.pk) in the Vercel project ' +
        'environment variables — it is baked into every canonical, Open Graph url, sitemap ' +
        'entry and structured-data url at build time.',
    );
  }
}

// Server env — only accessible on the server.
export const serverEnv = (() => {
  if (typeof window !== 'undefined') {
    return {} as z.infer<typeof serverEnvSchema>;
  }
  const parsed = serverEnvSchema.safeParse({
    API_URL: process.env.API_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    REDIS_URL: process.env.REDIS_URL,
    S3_REGION: process.env.S3_REGION,
    S3_BUCKET: process.env.S3_BUCKET,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    S3_PUBLIC_URL: process.env.S3_PUBLIC_URL,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    META_CAPI_ACCESS_TOKEN: process.env.META_CAPI_ACCESS_TOKEN,
    META_CAPI_TEST_EVENT_CODE: process.env.META_CAPI_TEST_EVENT_CODE,
    GA_API_SECRET: process.env.GA_API_SECRET,
    GA_PROPERTY_ID: process.env.GA_PROPERTY_ID,
    GA_SA_CLIENT_EMAIL: process.env.GA_SA_CLIENT_EMAIL,
    GA_SA_PRIVATE_KEY: process.env.GA_SA_PRIVATE_KEY,
    META_ADS_ACCESS_TOKEN: process.env.META_ADS_ACCESS_TOKEN,
    META_ADS_ACCOUNT_ID: process.env.META_ADS_ACCOUNT_ID,
    POSTEX_API_TOKEN: process.env.POSTEX_API_TOKEN,
    POSTEX_PICKUP_ADDRESS_CODE: process.env.POSTEX_PICKUP_ADDRESS_CODE,
    FCM_SERVICE_ACCOUNT_JSON: process.env.FCM_SERVICE_ACCOUNT_JSON,
    FCM_PROJECT_ID: process.env.FCM_PROJECT_ID,
    FCM_CLIENT_EMAIL: process.env.FCM_CLIENT_EMAIL,
    FCM_PRIVATE_KEY: process.env.FCM_PRIVATE_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
  });
  if (!parsed.success) {
    console.error('Invalid server environment variables:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid server environment variables');
  }

  // Production hardening: secrets that are optional in dev MUST be present (and
  // strong) in production. Fail fast at boot/build instead of at first request.
  if (publicEnv.NEXT_PUBLIC_ENVIRONMENT === 'production') {
    const problems: string[] = [];
    if (!parsed.data.JWT_SECRET || parsed.data.JWT_SECRET.length < 32) {
      problems.push('JWT_SECRET must be set and at least 32 characters');
    }
    // A dedicated refresh secret is REQUIRED in production: falling back to
    // JWT_SECRET would let a leaked access-signing key also mint refresh
    // tokens (and vice versa), collapsing the two trust domains into one.
    if (!parsed.data.JWT_REFRESH_SECRET || parsed.data.JWT_REFRESH_SECRET.length < 32) {
      problems.push('JWT_REFRESH_SECRET must be set and at least 32 characters');
    } else if (parsed.data.JWT_REFRESH_SECRET === parsed.data.JWT_SECRET) {
      problems.push('JWT_REFRESH_SECRET must differ from JWT_SECRET');
    }
    if (!parsed.data.DATABASE_URL) {
      problems.push('DATABASE_URL must be set');
    }
    // Stripe is all-or-nothing: if any payment secret is set, require both.
    const hasStripe = parsed.data.STRIPE_SECRET_KEY || parsed.data.STRIPE_WEBHOOK_SECRET;
    if (hasStripe && !(parsed.data.STRIPE_SECRET_KEY && parsed.data.STRIPE_WEBHOOK_SECRET)) {
      problems.push('STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET must both be set');
    }
    if (problems.length) {
      console.error('Invalid production environment:', problems);
      throw new Error(`Invalid production environment: ${problems.join('; ')}`);
    }
  }

  return parsed.data;
})();

export const isProd = publicEnv.NEXT_PUBLIC_ENVIRONMENT === 'production';
export const isDev = publicEnv.NEXT_PUBLIC_ENVIRONMENT === 'development';

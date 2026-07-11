import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  environment: process.env.NODE_ENV || "development",

  tracesSampleRate: 0.2,

  enabled:
    process.env.NODE_ENV === "production" ||
    process.env.SENTRY_ENABLED === "true",
});

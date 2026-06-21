export const ANALYTICS_EVENTS = {
  pageView: "page_view",
  signupStarted: "signup_started",
  signupCompleted: "signup_completed",
  signupFailed: "signup_failed",
  loginStarted: "login_started",
  loginCompleted: "login_completed",
  loginFailed: "login_failed",
  paywallViewed: "paywall_viewed",
  paywallCtaClicked: "paywall_cta_clicked",
  checkoutStarted: "checkout_started",
  paymentCompleted: "payment_completed",
  paymentFailed: "payment_failed",
  paymentCancelled: "payment_cancelled",
  premiumAccessGranted: "premium_access_granted",
  mapPreviewClicked: "map_preview_clicked",
  mapOpened: "map_opened",
  categoryFilterApplied: "category_filter_applied",
  searchPerformed: "search_performed",
  externalLinkClicked: "external_link_clicked",
  eventOutboundClicked: "event_outbound_clicked",
  notFoundViewed: "not_found_viewed",
  weatherLoadFailed: "weather_load_failed",
  newsLoadFailed: "news_load_failed",
} as const;

type AnalyticsProperty = string | number | boolean | null | undefined;
export type AnalyticsProperties = Record<string, AnalyticsProperty>;

type Gtag = (command: "js" | "config" | "event", eventName: string | Date, params?: AnalyticsProperties) => void;

declare global {
  interface Window {
    dataLayer?: Array<unknown>;
    gtag?: Gtag;
  }
}

const blockedKeyFragments = [
  "email",
  "password",
  "promo_code",
  "promocode",
  "payment_id",
  "paymentid",
  "user_id",
  "userid",
  "access_token",
  "refresh_token",
  "token",
  "authorization",
  "supabase",
  "url",
  "href",
];

const allowedSensitiveSummaryKeys = new Set(["has_promo_code"]);
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const initializedScripts = new Set<string>();
const onceKeys = new Set<string>();

const hasWindow = () => typeof window !== "undefined";

const shouldBlockKey = (key: string) => {
  const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "_");
  if (allowedSensitiveSummaryKeys.has(normalizedKey)) return false;
  return blockedKeyFragments.some((fragment) => normalizedKey.includes(fragment));
};

const scrubString = (value: string) => {
  if (emailPattern.test(value)) return "[redacted]";
  return value.slice(0, 200);
};

export const sanitizeAnalyticsProperties = (properties: AnalyticsProperties = {}) => {
  return Object.entries(properties).reduce<AnalyticsProperties>((safeProperties, [key, value]) => {
    if (shouldBlockKey(key) || value === undefined || value === null) return safeProperties;

    if (typeof value === "string") {
      safeProperties[key] = scrubString(value);
      return safeProperties;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      safeProperties[key] = value;
    }

    return safeProperties;
  }, {});
};

const normalizeReferrer = () => {
  if (!hasWindow() || !document.referrer) return "";

  try {
    const referrer = new URL(document.referrer);
    return `${referrer.origin}${referrer.pathname}`;
  } catch {
    return "";
  }
};

const insertScript = (id: string, src: string) => {
  if (!hasWindow() || initializedScripts.has(id) || document.getElementById(id)) return;

  const script = document.createElement("script");
  script.id = id;
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
  initializedScripts.add(id);
};

export const initializeAnalytics = () => {
  if (!hasWindow()) return;

  const gaMeasurementId = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;
  const gtmId = import.meta.env.VITE_GTM_ID as string | undefined;

  if (gaMeasurementId) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || ((...args: Parameters<Gtag>) => {
      window.dataLayer?.push(args);
    });

    insertScript("ga4-analytics", `https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`);
    window.gtag("js", new Date());
    window.gtag("config", gaMeasurementId, { send_page_view: false });
  }

  if (gtmId) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
    insertScript("gtm-analytics", `https://www.googletagmanager.com/gtm.js?id=${gtmId}`);
  }
};

export const track = (eventName: string, properties: AnalyticsProperties = {}) => {
  if (!/^[a-z][a-z0-9_]*$/.test(eventName)) return;

  const safeProperties = sanitizeAnalyticsProperties(properties);

  if (!hasWindow()) return;

  if (typeof window.gtag === "function") {
    window.gtag("event", eventName, safeProperties);
    return;
  }

  if (window.dataLayer) {
    window.dataLayer.push({ event: eventName, ...safeProperties });
  }
};

export const trackOnce = (key: string, eventName: string, properties: AnalyticsProperties = {}) => {
  if (onceKeys.has(key)) return;
  onceKeys.add(key);
  track(eventName, properties);
};

export const resetAnalyticsOnceGuards = () => {
  onceKeys.clear();
};

export const trackPageView = (location: Pick<Location, "pathname" | "search">) => {
  track(ANALYTICS_EVENTS.pageView, {
    page_path: `${location.pathname}${location.search}`,
    page_title: hasWindow() ? document.title : "",
    referrer: normalizeReferrer(),
  });
};

export const getSafeErrorType = (error: unknown) => {
  if (error instanceof Error && error.name) return error.name;
  return "unknown_error";
};

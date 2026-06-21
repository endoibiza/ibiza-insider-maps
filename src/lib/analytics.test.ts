/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANALYTICS_EVENTS,
  sanitizeAnalyticsProperties,
  track,
} from "./analytics";

describe("analytics", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    window.dataLayer = undefined;
    window.gtag = undefined;
  });

  it("scrubs sensitive property keys and email-like values", () => {
    const safeProperties = sanitizeAnalyticsProperties({
      email: "person@example.com",
      password: "secret",
      promoCode: "VIP123",
      payment_id: "pp_123",
      user_id: "user_123",
      page_path: "/auth",
      error_type: "AuthApiError",
      label: "Contact me at person@example.com",
      has_promo_code: true,
    });

    expect(safeProperties).toEqual({
      page_path: "/auth",
      error_type: "AuthApiError",
      label: "[redacted]",
      has_promo_code: true,
    });
  });

  it("no-ops when no analytics provider is configured", () => {
    expect(() => track(ANALYTICS_EVENTS.signupStarted, { source: "test" })).not.toThrow();
    expect(window.dataLayer).toBeUndefined();
  });

  it("pushes safe events to dataLayer when GTM is present", () => {
    window.dataLayer = [];

    track(ANALYTICS_EVENTS.signupCompleted, {
      source: "test",
      email: "person@example.com",
      has_promo_code: false,
    });

    expect(window.dataLayer).toEqual([
      {
        event: "signup_completed",
        source: "test",
        has_promo_code: false,
      },
    ]);
  });
});

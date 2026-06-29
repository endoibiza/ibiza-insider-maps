import { describe, expect, it } from "vitest";
import {
  beachStatusClasses,
  confidenceClasses,
  formatNumber,
  recommendationStatusClasses,
  reportIsStale,
  sourceHealthSummary,
  sourceStatusClasses,
  statusLabel,
  todayMadrid,
  WeatherSourceStatus,
} from "./weather";

describe("weather helpers", () => {
  it("summarizes source health without treating blocked AEMET as a hard failure", () => {
    const statuses: WeatherSourceStatus[] = [
      {
        source_key: "open-meteo-forecast",
        label: "Open-Meteo Forecast",
        status: "success",
        fetched_at: "2026-06-27T03:15:00Z",
        source_url: "https://api.open-meteo.com/v1/forecast",
        attribution: "Weather data by Open-Meteo.com",
      },
      {
        source_key: "aemet-daily-ibiza",
        label: "AEMET OpenData",
        status: "blocked",
        fetched_at: "2026-06-27T03:15:00Z",
        source_url: "https://opendata.aemet.es/opendata/api/prediccion/especifica/municipio/diaria/07026",
        attribution: "AEMET OpenData",
        message: "AEMET_API_KEY is not configured",
      },
    ];

    expect(sourceHealthSummary(statuses)).toEqual({
      updated: 1,
      blocked: 1,
      failed: 0,
      total: 2,
    });
    expect(statusLabel("blocked")).toBe("Needs key");
  });

  it("keeps missing numeric weather values visibly stale instead of inventing values", () => {
    expect(formatNumber(null, " C")).toBe("Updating");
    expect(formatNumber(undefined, " m")).toBe("Updating");
    expect(formatNumber(1.26, " m", 1)).toBe("1.3 m");
  });

  it("marks only today's Madrid report as fresh", () => {
    expect(reportIsStale(null)).toBe(true);
    expect(
      reportIsStale({
        id: "weather-report",
        report_date: todayMadrid(),
        title: "Ibiza Weather",
        headline: "Source-backed Ibiza beach weather",
        summary: "Stored report.",
        current_conditions: {},
        hourly_forecast: [],
        daily_forecast: [],
        marine_summary: {},
        beach_conditions: [],
        alerts_summary: [],
        source_status: [],
        source_disagreements: [],
        attribution: [],
        stale_flags: [],
        sources_checked: [],
        generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    ).toBe(false);
  });

  it("returns stable style classes for source and beach states", () => {
    expect(sourceStatusClasses("success")).toContain("emerald");
    expect(sourceStatusClasses("failed")).toContain("red");
    expect(beachStatusClasses("caution")).toContain("amber");
    expect(recommendationStatusClasses("great")).toContain("emerald");
    expect(recommendationStatusClasses("avoid")).toContain("red");
    expect(confidenceClasses("medium")).toContain("amber");
  });
});

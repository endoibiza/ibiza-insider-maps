import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const collector = readFileSync(
  "supabase/functions/collect-ibiza-news/index.ts",
  "utf8",
);
const resolver = readFileSync(
  "supabase/functions/resolve-ibiza-signals/index.ts",
  "utf8",
);

describe("Ibiza News dedicated Cron authorization", () => {
  it("accepts only the existing admin paths or the dedicated hashed Cron token", () => {
    for (const source of [collector, resolver]) {
      expect(source).toContain("news_cron_sync_admin_token_sha256");
      expect(source).toContain('req.headers.get("x-sync-admin-token")');
      expect(source).toContain("await sha256(");
      expect(source).toContain("Unauthorized sync request");
      expect(source).not.toContain("ibiza_news_cron_sync_admin_token");
    }
  });

  it("records the Cron trigger key without changing source or publish rules", () => {
    expect(collector).toContain("trigger_key: request.trigger_key || null");
    expect(collector).toContain("requested_publish: request.publish");
    expect(collector).toContain("enforce_primary_resolution: request.enforce_primary_resolution");
    expect(resolver).toContain("trigger_key: request.triggerKey");
    expect(resolver).toContain("limit: Math.max(1, Math.min(body.limit ?? 300, 600))");
  });

  it("does not expose the internal service-role credential in responses or metadata", () => {
    expect(collector).not.toMatch(/JSON\.stringify\([^)]*serviceRoleKey/);
    expect(resolver).not.toMatch(/JSON\.stringify\([^)]*serviceRoleKey/);
    expect(collector).not.toContain("trigger_key: serviceRoleKey");
    expect(resolver).not.toContain("trigger_key: serviceRoleKey");
  });
});

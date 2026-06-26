const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const target = process.env.TARGET || "events";
const dryRun = process.env.DRY_RUN !== "false";
const includeRecords = process.env.INCLUDE_RECORDS === "true";
const includeVipAvailability = process.env.INCLUDE_VIP_AVAILABILITY === "true";
const horizonDays = Number(process.env.HORIZON_DAYS || 7);
const limit = Number(process.env.LIMIT || 100);
const organizationId = process.env.ORGANIZATION_ID || "";
const bookingQuantity = Number(process.env.BOOKING_QUANTITY || 4);

const body =
  target === "auth"
    ? { target: "auth" }
    : {
        target: "events",
        dry_run: dryRun,
        include_records: includeRecords,
        include_vip_availability: includeVipAvailability,
        horizon_days: horizonDays,
        lookback_days: 0,
        limit,
        booking_quantity: bookingQuantity,
        ...(organizationId ? { organization_id: organizationId } : {}),
      };

const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/run-fourvenues-sync-service-role`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  },
  body: JSON.stringify(body),
});

const text = await response.text();
let payload = null;
try {
  payload = text ? JSON.parse(text) : null;
} catch {
  payload = { raw: text };
}

console.log(JSON.stringify({ status: response.status, request: body, response: payload }, null, 2));

if (!response.ok || payload?.success === false) {
  throw new Error(`Fourvenues service sync failed: ${response.status}`);
}

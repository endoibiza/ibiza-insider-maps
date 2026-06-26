const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.env.APPLY === "true";
const PAGE_SIZE = Math.min(Math.max(Number(process.env.PAGE_SIZE || process.env.LIMIT || 500), 1), 1000);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const headers = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "content-type": "application/json",
};

const request = async (path, options = {}) => {
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers ?? {}) },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} failed: ${response.status} ${text}`);
  }
  return text ? JSON.parse(text) : null;
};

const betterKinds = new Set(["tickets", "vip_tables", "guest_list", "preregister", "official_event_page"]);

const fetchAllActiveOptions = async () => {
  const output = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await request(
      `event_booking_options?select=id,ibiza_event_id,kind,provider,label,url,priority,active,metadata&active=eq.true&order=created_at.asc&limit=${PAGE_SIZE}&offset=${offset}`,
    );
    output.push(...(page || []));
    if (!page || page.length < PAGE_SIZE) return output;
  }
};

const options = await fetchAllActiveOptions();

const byEvent = new Map();
for (const option of options || []) {
  byEvent.set(option.ibiza_event_id, [...(byEvent.get(option.ibiza_event_id) || []), option]);
}

const moreInfoOptions = (options || []).filter((option) => option.active === true && option.kind === "more_info");

const staleTargets = [];
const kept = [];

for (const option of moreInfoOptions) {
  const siblings = (byEvent.get(option.ibiza_event_id) || []).filter((sibling) => sibling.id !== option.id);
  const better = siblings.filter((sibling) => sibling.active === true && betterKinds.has(sibling.kind));
  const isFourvenuesMoreInfo =
    option.provider === "fourvenues" && /https?:\/\/([^/]+\.)?fourvenues\.com\//i.test(option.url);
  const duplicatesBetterUrl = better.some((sibling) => sibling.url === option.url);
  const isFourvenuesManualMoreInfo =
    option.provider === "manual" && /https?:\/\/([^/]+\.)?fourvenues\.com\//i.test(option.url);

  if (better.length > 0 && (isFourvenuesMoreInfo || isFourvenuesManualMoreInfo || duplicatesBetterUrl)) {
    staleTargets.push({
      option,
      reason: duplicatesBetterUrl
        ? "same_event_has_more_specific_booking_option_with_same_url"
        : "same_event_has_more_specific_booking_option",
      better: better.map((sibling) => `${sibling.kind}:${sibling.provider}:${sibling.label}`),
    });
  } else {
    kept.push({
      id: option.id,
      ibiza_event_id: option.ibiza_event_id,
      url: option.url,
      reason: "only_available_public_option_for_event",
    });
  }
}

console.log(
  JSON.stringify(
    {
      apply: APPLY,
      active_options_scanned: options?.length ?? 0,
      active_more_info: moreInfoOptions.length,
      stale_targets_to_deactivate: staleTargets.length,
      kept_more_info: kept.length,
      target_preview: staleTargets.slice(0, 50).map((target) => ({
        option_id: target.option.id,
        event_id: target.option.ibiza_event_id,
        label: target.option.label,
        url: target.option.url,
        reason: target.reason,
        better: target.better,
      })),
      kept_preview: kept.slice(0, 30),
    },
    null,
    2,
  ),
);

if (!APPLY || staleTargets.length === 0) {
  process.exit(0);
}

const now = new Date().toISOString();
for (const target of staleTargets) {
  await request(`event_booking_options?id=eq.${target.option.id}`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({
      active: false,
      metadata: {
        ...(target.option.metadata || {}),
        deactivated_by: "event-booking-options-cleanup",
        deactivated_at: now,
        deactivation_reason: target.reason,
        better_options: target.better,
      },
    }),
  });
}

await request("sync_log", {
  method: "POST",
  headers: { prefer: "return=minimal" },
  body: JSON.stringify({
    table_name: "event_booking_options_cleanup",
    records_upserted: staleTargets.length,
    metadata: {
      status: "success",
      repair: "Deactivated stale Fourvenues iframe More Info options when a more specific public booking option exists.",
      active_more_info: moreInfoOptions.length,
      kept_more_info: kept.length,
    },
  }),
});

console.log(`Deactivated ${staleTargets.length} stale Fourvenues iframe More Info options.`);

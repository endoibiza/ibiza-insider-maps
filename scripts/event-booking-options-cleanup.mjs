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
const kindRank = {
  tickets: 10,
  official_event_page: 20,
  vip_tables: 30,
  guest_list: 40,
  preregister: 50,
  more_info: 60,
};
const providerRank = {
  fourvenues: 10,
  ticketing_platform: 20,
  official_venue: 30,
  manual: 80,
  ibiza_spotlight: 90,
};

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
const duplicateUrlTargets = [];
const duplicateLabelTargets = [];

const optionSort = (a, b) => {
  const rankDiff = (kindRank[a.kind] ?? 100) - (kindRank[b.kind] ?? 100);
  if (rankDiff !== 0) return rankDiff;
  const providerDiff = (providerRank[a.provider] ?? 100) - (providerRank[b.provider] ?? 100);
  if (providerDiff !== 0) return providerDiff;
  return Number(a.priority || 100) - Number(b.priority || 100);
};

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

for (const eventOptions of byEvent.values()) {
  const byUrl = new Map();
  for (const option of eventOptions.filter((item) => item.active === true)) {
    const key = String(option.url || "").trim().replace(/\/$/, "");
    if (!key) continue;
    byUrl.set(key, [...(byUrl.get(key) || []), option]);
  }

  for (const [url, duplicates] of byUrl.entries()) {
    if (duplicates.length < 2) continue;
    const sorted = [...duplicates].sort(optionSort);
    const keeper = sorted[0];
    for (const duplicate of sorted.slice(1)) {
      duplicateUrlTargets.push({
        option: duplicate,
        reason: "same_event_has_stronger_label_for_same_url",
        kept: `${keeper.kind}:${keeper.provider}:${keeper.label}`,
        url,
      });
    }
  }

  const byKindLabel = new Map();
  for (const option of eventOptions.filter((item) => item.active === true)) {
    const key = `${option.kind}:${String(option.label || "").trim().toLowerCase()}`;
    byKindLabel.set(key, [...(byKindLabel.get(key) || []), option]);
  }

  for (const [kindLabel, duplicates] of byKindLabel.entries()) {
    if (duplicates.length < 2) continue;
    const sorted = [...duplicates].sort(optionSort);
    const keeper = sorted[0];
    for (const duplicate of sorted.slice(1)) {
      duplicateLabelTargets.push({
        option: duplicate,
        reason: "same_event_has_stronger_provider_for_same_button_label",
        kept: `${keeper.kind}:${keeper.provider}:${keeper.label}`,
        kind_label: kindLabel,
      });
    }
  }
}

const targetsById = new Map();
for (const target of [...staleTargets, ...duplicateUrlTargets, ...duplicateLabelTargets]) {
  targetsById.set(target.option.id, target);
}
const targets = [...targetsById.values()];

console.log(
  JSON.stringify(
    {
      apply: APPLY,
      active_options_scanned: options?.length ?? 0,
      active_more_info: moreInfoOptions.length,
      stale_more_info_targets_to_deactivate: staleTargets.length,
      duplicate_url_targets_to_deactivate: duplicateUrlTargets.length,
      duplicate_label_targets_to_deactivate: duplicateLabelTargets.length,
      total_targets_to_deactivate: targets.length,
      kept_more_info: kept.length,
      target_preview: targets.slice(0, 50).map((target) => ({
        option_id: target.option.id,
        event_id: target.option.ibiza_event_id,
        label: target.option.label,
        url: target.option.url,
        reason: target.reason,
        better: target.better,
        kept: target.kept,
        kind_label: target.kind_label,
      })),
      kept_preview: kept.slice(0, 30),
    },
    null,
    2,
  ),
);

if (!APPLY || targets.length === 0) {
  process.exit(0);
}

const now = new Date().toISOString();
for (const target of targets) {
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
        kept_option: target.kept,
      },
    }),
  });
}

await request("sync_log", {
  method: "POST",
  headers: { prefer: "return=minimal" },
  body: JSON.stringify({
    table_name: "event_booking_options_cleanup",
    records_upserted: targets.length,
    metadata: {
      status: "success",
      repair: "Deactivated stale More Info options and duplicate same-URL booking options when stronger labels exist.",
      active_more_info: moreInfoOptions.length,
      kept_more_info: kept.length,
      duplicate_url_targets: duplicateUrlTargets.length,
      duplicate_label_targets: duplicateLabelTargets.length,
    },
  }),
});

console.log(`Deactivated ${targets.length} stale or duplicate booking options.`);

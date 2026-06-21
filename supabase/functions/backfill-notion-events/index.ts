import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-admin-token, x-sync-secret",
};

const NOTION_API_URL = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

type NotionPage = {
  id: string;
  archived?: boolean;
  properties: Record<string, unknown>;
};

type BackfillRequest = {
  dry_run?: boolean;
  include_historical?: boolean;
  include_cancelled?: boolean;
  disable_orphan_cleanup?: boolean;
  create_sync_log?: boolean;
};

type EventRecord = {
  notion_page_id: string;
  event_name: string;
  date: string | null;
  start_time: string | number | boolean | null;
  end_time: string | number | boolean | null;
  venue: string | number | boolean | null;
  event_series: string | number | boolean | null;
  type: string | number | boolean | null;
  lineup_details: string | number | boolean | null;
  mikes_pick: boolean;
  status: string | number | boolean | null;
  event_url: string | number | boolean | null;
  source: string | number | boolean | null;
  notes: string | number | boolean | null;
  residents_pass: string | number | boolean | null;
  featured_on_party_calendar: boolean;
  last_synced_at: string;
};

const getEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
};

const requireSyncToken = (req: Request) => {
  const expectedToken = Deno.env.get("SYNC_ADMIN_TOKEN") || Deno.env.get("ADMIN_API_KEY");
  if (!expectedToken) throw new Error("SYNC_ADMIN_TOKEN or ADMIN_API_KEY is not configured");
  const actualToken = req.headers.get("x-sync-admin-token") || req.headers.get("x-sync-secret");
  if (actualToken !== expectedToken) throw new Error("Unauthorized");
};

const getTodayDate = () => new Date().toISOString().slice(0, 10);

const getNotionText = (prop: unknown): string | number | boolean | null => {
  if (!prop || typeof prop !== "object") return null;
  const typed = prop as Record<string, any>;
  if (typed.type === "title") return typed.title?.map((item: any) => item.plain_text).join("") || null;
  if (typed.type === "rich_text") return typed.rich_text?.map((item: any) => item.plain_text).join("") || null;
  if (typed.type === "url") return typed.url || null;
  if (typed.type === "number") return typed.number;
  if (typed.type === "checkbox") return typed.checkbox;
  if (typed.type === "select") return typed.select?.name || null;
  if (typed.type === "multi_select") return typed.multi_select?.map((item: any) => item.name).join(", ") || null;
  if (typed.type === "status") return typed.status?.name || null;
  if (typed.type === "date") return typed.date?.start || null;
  return null;
};

const queryNotionDatabase = async (dbId: string, apiKey: string, filter?: Record<string, unknown>) => {
  const pages: NotionPage[] = [];
  let startCursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const body: Record<string, unknown> = { page_size: 100 };
    if (filter) body.filter = filter;
    if (startCursor) body.start_cursor = startCursor;

    const response = await fetch(`${NOTION_API_URL}/databases/${dbId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Notion API error (${response.status}): ${await response.text()}`);
    }

    const data = await response.json();
    pages.push(...data.results);
    hasMore = Boolean(data.has_more);
    startCursor = data.next_cursor;
  }

  return pages;
};

const mapEventPage = (page: NotionPage): EventRecord => ({
  notion_page_id: page.id,
  event_name: String(getNotionText(page.properties["Event Name"]) || "Untitled Event"),
  date: (getNotionText(page.properties["Date"]) as string | null) ?? null,
  start_time: getNotionText(page.properties["Start Time"]),
  end_time: getNotionText(page.properties["End Time"]),
  venue: getNotionText(page.properties["Venue"]),
  event_series: getNotionText(page.properties["Event Series"]),
  type: getNotionText(page.properties["Type"]),
  lineup_details: getNotionText(page.properties["Lineup & Details"]),
  mikes_pick: getNotionText(page.properties["Mike's Pick"]) === true,
  status: getNotionText(page.properties["Status"]),
  event_url: getNotionText(page.properties["Event URL"]),
  source: getNotionText(page.properties["Source"]),
  notes: getNotionText(page.properties["Notes"]),
  residents_pass: getNotionText(page.properties["Residents Pass"]),
  featured_on_party_calendar: getNotionText(page.properties["Featured on Party Calendar"]) === true,
  last_synced_at: new Date().toISOString(),
});

const chunk = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const statusDistribution = (records: EventRecord[]) =>
  records.reduce<Record<string, number>>((acc, record) => {
    const key = String(record.status || "Unknown");
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

const dateDistribution = (records: EventRecord[]) => {
  const today = getTodayDate();
  return {
    missing_date: records.filter((record) => !record.date).length,
    historical: records.filter((record) => record.date && record.date < today).length,
    upcoming_or_today: records.filter((record) => record.date && record.date >= today).length,
    earliest_date: records.map((record) => record.date).filter(Boolean).sort()[0] ?? null,
    latest_date: records.map((record) => record.date).filter(Boolean).sort().at(-1) ?? null,
  };
};

const buildCurrentFilter = (includeHistorical: boolean, includeCancelled: boolean) => {
  const filters: Record<string, unknown>[] = [];
  if (!includeHistorical) filters.push({ property: "Date", date: { on_or_after: getTodayDate() } });
  if (!includeCancelled) filters.push({ property: "Status", status: { does_not_equal: "Cancelled" } });
  if (!filters.length) return undefined;
  return { and: filters };
};

const fetchExistingNotionIds = async (supabase: ReturnType<typeof createClient>) => {
  const existingIds = new Set<string>();
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("ibiza_events")
      .select("notion_page_id")
      .not("notion_page_id", "like", "agent:%")
      .not("notion_page_id", "like", "fourvenues:%")
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(`Existing event lookup failed: ${error.message}`);
    for (const row of data ?? []) existingIds.add(row.notion_page_id);
    if (!data || data.length < pageSize) break;
    offset += pageSize;
  }

  return existingIds;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    requireSyncToken(req);
  } catch {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = req.method === "POST" ? ((await req.json().catch(() => ({}))) as BackfillRequest) : {};
    const dryRun = body.dry_run ?? true;
    const includeHistorical = body.include_historical ?? true;
    const includeCancelled = body.include_cancelled ?? true;
    const disableOrphanCleanup = body.disable_orphan_cleanup ?? true;

    const supabase = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const notionApiKey = getEnv("NOTION_API_KEY");
    const eventsDbId = getEnv("NOTION_EVENTS_DB_ID");

    const pages = await queryNotionDatabase(eventsDbId, notionApiKey, buildCurrentFilter(includeHistorical, includeCancelled));
    const records = pages.map(mapEventPage);
    const existingIds = await fetchExistingNotionIds(supabase);

    const analysis = {
      notion_pages_seen: pages.length,
      would_insert: records.filter((record) => !existingIds.has(record.notion_page_id)).length,
      would_update: records.filter((record) => existingIds.has(record.notion_page_id)).length,
      missing_event_name: records.filter((record) => !record.event_name || record.event_name === "Untitled Event").length,
      missing_date: records.filter((record) => !record.date).length,
      missing_event_url: records.filter((record) => !record.event_url).length,
      missing_lineup_details: records.filter((record) => !record.lineup_details).length,
      status_distribution: statusDistribution(records),
      date_distribution: dateDistribution(records),
      orphan_cleanup_disabled: disableOrphanCleanup,
    };

    if (dryRun) {
      return new Response(JSON.stringify({ success: true, dry_run: true, analysis }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let upserted = 0;
    for (const recordBatch of chunk(records, 500)) {
      const { error } = await supabase
        .from("ibiza_events")
        .upsert(recordBatch, { onConflict: "notion_page_id" });
      if (error) throw new Error(`Events upsert error: ${error.message}`);
      upserted += recordBatch.length;
    }

    if (body.create_sync_log ?? true) {
      const { error: logError } = await supabase.from("sync_log").insert({
        table_name: "ibiza_events",
        records_upserted: upserted,
        metadata: {
          sync_type: "notion_events_full_backfill",
          analysis,
          dry_run: false,
          include_historical: includeHistorical,
          include_cancelled: includeCancelled,
          orphan_cleanup_disabled: disableOrphanCleanup,
        },
      });
      if (logError) throw new Error(`Sync log insert error: ${logError.message}`);
    }

    return new Response(JSON.stringify({ success: true, dry_run: false, upserted, analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

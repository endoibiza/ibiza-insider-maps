export type SignalCategory =
  | "local_breaking_news"
  | "government_municipal"
  | "weather_alert_chatter"
  | "events_lineup_changes"
  | "transport_public_safety"
  | "tourism_community"
  | "source_hint";

export interface SignalDigestRun {
  id: string;
  run_type: string;
  mode: string;
  status: string;
  target_date: string;
  started_at: string;
  finished_at: string | null;
  sources_seen: number;
  snapshots_inserted: number;
  items_seen: number;
  items_stored: number;
  duplicates_seen: number;
  credential_requirements: Array<Record<string, unknown>>;
  skipped_sources: Array<Record<string, unknown>>;
  source_failures: Array<Record<string, unknown>>;
  cost_metadata: Record<string, unknown>;
}

export interface SignalDigestItem {
  id: string;
  digest_date: string;
  category: SignalCategory;
  title: string;
  summary: string;
  source_url: string;
  source_domain: string;
  source_timestamp: string | null;
  source_type: string;
  source_kind: string;
  source_score: number;
  verification_status: string;
  privacy_status: string;
  created_at: string;
  source_label: string | null;
  run_status: string | null;
  run_mode: string | null;
  target_type: string | null;
  link_status: string | null;
}

export const SIGNAL_CATEGORY_LABELS: Record<SignalCategory, string> = {
  local_breaking_news: "Breaking news",
  government_municipal: "Government",
  weather_alert_chatter: "Weather alerts",
  events_lineup_changes: "Events",
  transport_public_safety: "Transport and safety",
  tourism_community: "Community",
  source_hint: "Source hints",
};

const CATEGORY_STYLES: Record<SignalCategory, string> = {
  local_breaking_news: "border-red-200 bg-red-50 text-red-700",
  government_municipal: "border-blue-200 bg-blue-50 text-blue-700",
  weather_alert_chatter: "border-orange-200 bg-orange-50 text-orange-700",
  events_lineup_changes: "border-violet-200 bg-violet-50 text-violet-700",
  transport_public_safety: "border-indigo-200 bg-indigo-50 text-indigo-700",
  tourism_community: "border-emerald-200 bg-emerald-50 text-emerald-700",
  source_hint: "border-slate-200 bg-slate-50 text-slate-700",
};

export const signalCategoryStyle = (category: SignalCategory) =>
  CATEGORY_STYLES[category] || CATEGORY_STYLES.source_hint;

export const formatMadridDateTime = (value?: string | null) => {
  if (!value) return "Not recorded";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

export const getSignalSourceLabel = (item: Pick<SignalDigestItem, "source_label" | "source_domain" | "source_url">) => {
  if (item.source_label) return item.source_label;
  if (item.source_domain) return item.source_domain;

  try {
    return new URL(item.source_url).hostname.replace(/^www\./, "");
  } catch {
    return "Source";
  }
};

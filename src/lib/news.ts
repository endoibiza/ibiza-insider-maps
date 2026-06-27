export type NewsView = "front" | "all" | "santa";

export interface PublicNewsStory {
  id: string;
  notion_page_id?: string | null;
  headline: string;
  summary: string;
  category: string;
  area: string | null;
  source_url: string;
  date: string | null;
  created_at: string;
  updated_at: string;
  significance: string | null;
  ibiza_maps_relevant: boolean | null;
  santa_eularia: boolean | null;
  source_label?: string | null;
  source_domain?: string | null;
  digest_section?: string | null;
  published_at?: string | null;
  legacy_source?: boolean | null;
}

export interface PublicNewsDigest {
  id: string;
  digest_date: string;
  title: string;
  summary: string | null;
  sections: Record<string, string[]>;
  story_ids: string[];
  source_keys: string[];
  sources_checked: string[];
  skipped_sources: Array<Record<string, unknown>>;
  counts: Record<string, number>;
  generated_at: string;
  created_at: string;
  updated_at: string;
}

export interface NewsPayload {
  digest: PublicNewsDigest | null;
  stories: PublicNewsStory[];
}

export const NEWS_CATEGORIES = [
  "All",
  "Public Safety",
  "Government",
  "Tourism",
  "Infrastructure",
  "Environment",
  "Culture",
  "Business",
  "Community",
  "Weather Alert",
  "Transport",
] as const;

const CATEGORY_STYLES: Record<string, string> = {
  "Public Safety": "border-red-200 bg-red-50 text-red-700",
  Crime: "border-red-200 bg-red-50 text-red-700",
  Government: "border-blue-200 bg-blue-50 text-blue-700",
  Tourism: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Infrastructure: "border-slate-200 bg-slate-50 text-slate-700",
  Environment: "border-green-200 bg-green-50 text-green-700",
  Culture: "border-violet-200 bg-violet-50 text-violet-700",
  Business: "border-amber-200 bg-amber-50 text-amber-700",
  Community: "border-cyan-200 bg-cyan-50 text-cyan-700",
  "Weather Alert": "border-orange-200 bg-orange-50 text-orange-700",
  Transport: "border-indigo-200 bg-indigo-50 text-indigo-700",
  Health: "border-rose-200 bg-rose-50 text-rose-700",
  Other: "border-slate-200 bg-slate-50 text-slate-700",
};

export const categoryStyle = (category: string) => CATEGORY_STYLES[category] || CATEGORY_STYLES.Other;

export const splitAreaLabels = (area?: string | null): string[] =>
  (area || "Island-Wide")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

export const getSourceHost = (story: Pick<PublicNewsStory, "source_url" | "source_domain" | "source_label">) => {
  if (story.source_label) return story.source_label;
  if (story.source_domain) return story.source_domain;

  try {
    return new URL(story.source_url).hostname.replace(/^www\./, "");
  } catch {
    return "Source";
  }
};

export const formatStoryDate = (story: Pick<PublicNewsStory, "date" | "published_at" | "created_at">) => {
  const value = story.date || story.published_at || story.created_at;
  if (!value) return "";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    day: "numeric",
    month: "short",
  }).format(new Date(value));
};

export const formatLongMadridDate = (value: string | Date) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(typeof value === "string" ? new Date(`${value}T12:00:00+02:00`) : value);

export const todayMadrid = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export const isDirectNewsUrl = (value?: string | null) => {
  if (!value) return false;
  try {
    const url = new URL(value);
    const segments = url.pathname.split("/").filter(Boolean);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    if (segments.length === 0) return false;
    if (/\/(rss|feed|atom)(\/|$)/i.test(url.pathname)) return false;
    return true;
  } catch {
    return false;
  }
};

export const uniqueAreas = (stories: PublicNewsStory[]) => {
  const areas = new Set<string>();
  stories.forEach((story) => splitAreaLabels(story.area).forEach((area) => areas.add(area)));
  return Array.from(areas).sort((left, right) => left.localeCompare(right));
};

export const filterStories = (stories: PublicNewsStory[], view: NewsView, category: string, area: string | null) => {
  return stories.filter((story) => {
    if (view === "santa" && !story.santa_eularia && !splitAreaLabels(story.area).includes("Santa Eulària")) return false;
    if (view === "front" && story.digest_section === "weekly_crime") return false;
    if (category !== "All" && story.category !== category) return false;
    if (area && !splitAreaLabels(story.area).includes(area)) return false;
    return isDirectNewsUrl(story.source_url);
  });
};

export const digestIsStale = (digest: PublicNewsDigest | null) => {
  if (!digest?.digest_date) return true;
  return digest.digest_date !== todayMadrid();
};

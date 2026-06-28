import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink, List, Loader2, Map, MapPin, Newspaper, RefreshCw, ShieldCheck, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NewsSkeleton } from "@/components/ui/skeleton-loaders";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ANALYTICS_EVENTS, getSafeErrorType, track } from "@/lib/analytics";
import {
  categoryStyle,
  digestIsStale,
  filterStories,
  formatLongMadridDate,
  formatStoryDate,
  getSourceHost,
  isDirectNewsUrl,
  NEWS_AREA_FILTERS,
  NEWS_CATEGORIES,
  NewsPayload,
  NewsView,
  PublicNewsStory,
  splitAreaLabels,
  todayMadrid,
  uniqueAreas,
} from "@/lib/news";
import { cn } from "@/lib/utils";

interface NewsWidgetProps {
  autoLoad?: boolean;
}

const newsSelect =
  "id,notion_page_id,headline,summary,category,area,source_url,date,created_at,updated_at,significance,ibiza_maps_relevant,santa_eularia,source_label,source_domain,digest_section,published_at,legacy_source,display_language,translation_status,primary_area,curation_score";

type QueryError = { message: string };
type QueryResponse<T> = Promise<{ data: T[] | null; error: QueryError | null }>;
type QueryBuilder<T> = {
  select: (columns: string) => QueryBuilder<T>;
  order: (column: string, options?: { ascending?: boolean }) => QueryBuilder<T>;
  limit: (count: number) => QueryResponse<T>;
};
type PublicReadClient = {
  from: <T>(table: string) => QueryBuilder<T>;
};

const fetchNewsPayload = async (): Promise<NewsPayload> => {
  const client = supabase as unknown as PublicReadClient;

  const digestRequest = client
    .from<NonNullable<NewsPayload["digest"]>>("ibiza_news_daily_digests_public")
    .select("*")
    .order("digest_date", { ascending: false })
    .limit(1);

  const storiesRequest = client
    .from<PublicNewsStory>("ibiza_news_public")
    .select(newsSelect)
    .order("date", { ascending: false })
    .order("curation_score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(80);

  const [digestResponse, storiesResponse] = await Promise.all([digestRequest, storiesRequest]);

  if (storiesResponse.error) {
    const fallback = await client
      .from<PublicNewsStory>("ibiza_news")
      .select("id,notion_page_id,headline,summary,category,area,source_url,date,created_at,updated_at,significance,ibiza_maps_relevant,santa_eularia")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(80);

    if (fallback.error) throw new Error(storiesResponse.error.message);

    return {
      digest: null,
      stories: (fallback.data || []).filter((story) => isDirectNewsUrl(story.source_url)),
    };
  }

  return {
    digest: digestResponse.error ? null : digestResponse.data?.[0] ?? null,
    stories: (storiesResponse.data || []).filter((story) => isDirectNewsUrl(story.source_url)),
  };
};

const StoryCard = ({ story, featured = false }: { story: PublicNewsStory; featured?: boolean }) => {
  const areas = splitAreaLabels(story.area);
  const displayAreas = story.primary_area && !areas.includes(story.primary_area) ? [story.primary_area, ...areas] : areas;
  const source = getSourceHost(story);

  return (
    <article
      className={cn(
        "border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
        featured ? "border-t-2 border-t-primary p-5 md:p-6" : "border-t-2 border-t-orange-300 p-4",
      )}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline" className={cn("uppercase tracking-normal", categoryStyle(story.category))}>
          {story.category || "Other"}
        </Badge>
        {displayAreas.slice(0, 2).map((area) => (
          <span key={area} className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {area}
          </span>
        ))}
        <span className="ml-auto">{formatStoryDate(story)}</span>
      </div>

      <h2 className={cn("font-semibold leading-snug text-foreground", featured ? "text-xl md:text-2xl" : "text-base")}>
        {story.headline}
      </h2>
      <p className={cn("mt-3 text-sm leading-6 text-muted-foreground", featured ? "md:text-base" : "")}>{story.summary}</p>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>{source}</span>
        <a
          href={story.source_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track(ANALYTICS_EVENTS.externalLinkClicked, { source: "news_story", category: story.category })}
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          Read article
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </article>
  );
};

const ViewButton = ({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) => (
  <Button
    type="button"
    size="sm"
    variant={active ? "default" : "outline"}
    onClick={onClick}
    className="h-9 rounded-full"
  >
    <Icon className="mr-2 h-4 w-4" />
    {label}
  </Button>
);

const NewsWidget = ({ autoLoad: _autoLoad = true }: NewsWidgetProps) => {
  const [view, setView] = useState<NewsView>("front");
  const [category, setCategory] = useState<string>("All");
  const [area, setArea] = useState<string | null>(null);
  const { toast } = useToast();

  const { data, error, isFetching, isLoading, refetch } = useQuery({
    queryKey: ["ibiza-news-public"],
    queryFn: fetchNewsPayload,
    staleTime: 1000 * 60 * 5,
  });

  const stories = useMemo(() => data?.stories ?? [], [data?.stories]);
  const areas = useMemo(() => uniqueAreas(stories), [stories]);
  const visibleStories = useMemo(() => filterStories(stories, view, category, area), [stories, view, category, area]);
  const topStory = visibleStories[0];
  const remainingStories = view === "front" ? visibleStories.slice(1, 12) : visibleStories;
  const stale = digestIsStale(data?.digest ?? null);
  const lastUpdated = data?.digest?.updated_at || data?.digest?.generated_at || stories[0]?.updated_at || null;

  useEffect(() => {
    if (!error) return;
    track(ANALYTICS_EVENTS.newsLoadFailed, {
      source: "news_widget",
      error_type: getSafeErrorType(error),
    });
  }, [error]);

  const handleRefresh = async () => {
    const result = await refetch();
    if (result.error) {
      toast({
        title: "News Error",
        description: result.error instanceof Error ? result.error.message : "Unable to load source-backed news",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-6 text-center">
          <Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading verified Ibiza news...</p>
        </div>
        <NewsSkeleton />
      </div>
    );
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-10 md:py-14">
      <div className="mb-7 flex flex-col items-center gap-4">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">{formatLongMadridDate(data?.digest?.digest_date || todayMadrid())}</p>
          <p className="mt-2 inline-flex items-center gap-2 text-xs font-medium text-slate-600">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            English summaries from verified local sources. Original articles open at source.
          </p>
          {lastUpdated && (
            <p className="mt-1 text-xs text-muted-foreground">
              Last updated{" "}
              {new Intl.DateTimeFormat("en-GB", {
                timeZone: "Europe/Madrid",
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(lastUpdated))}
            </p>
          )}
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          <ViewButton active={view === "front"} icon={Newspaper} label="Front Page" onClick={() => setView("front")} />
          <ViewButton active={view === "all"} icon={List} label="All Stories" onClick={() => setView("all")} />
          <ViewButton active={view === "area"} icon={Map} label="By Area" onClick={() => setView("area")} />
          <ViewButton active={view === "santa"} icon={MapPin} label="Santa Eulària" onClick={() => setView("santa")} />
          <ViewButton active={view === "formentera"} icon={MapPin} label="Formentera" onClick={() => setView("formentera")} />
          <Button type="button" size="sm" variant="ghost" onClick={handleRefresh} disabled={isFetching} className="h-9 rounded-full">
            {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </div>

      {stale && (
        <div className="mb-6 flex items-center justify-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 flex-none" />
          Today's news digest has not published yet; showing the most recent verified source-backed stories.
        </div>
      )}

      <div className="mb-5 flex gap-2 overflow-x-auto pb-2 text-sm">
        <span className="flex-none py-2 text-xs font-medium text-muted-foreground">Area:</span>
        <Button size="sm" variant={area === null ? "default" : "outline"} onClick={() => setArea(null)} className="h-8 flex-none rounded-full">
          All
        </Button>
        {NEWS_AREA_FILTERS.filter((areaLabel) => areas.includes(areaLabel)).map((areaLabel) => (
          <Button
            key={areaLabel}
            size="sm"
            variant={area === areaLabel ? "default" : "outline"}
            onClick={() => {
              setArea(areaLabel);
              setView("area");
            }}
            className="h-8 flex-none rounded-full"
          >
            {areaLabel}
          </Button>
        ))}
      </div>

      <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
        {NEWS_CATEGORIES.map((categoryLabel) => (
          <Button
            key={categoryLabel}
            size="sm"
            variant={category === categoryLabel ? "default" : "outline"}
            onClick={() => setCategory(categoryLabel)}
            className="h-8 flex-none rounded-full"
          >
            {categoryLabel}
          </Button>
        ))}
      </div>

      {visibleStories.length === 0 ? (
        <div className="rounded-md border border-dashed bg-white px-6 py-12 text-center">
          <Newspaper className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <h2 className="text-lg font-semibold">No verified stories match these filters</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Source-backed stories will appear here after the next successful cloud ingestion run.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {view === "front" && topStory && <StoryCard story={topStory} featured />}
          <div className="grid gap-5 md:grid-cols-2">
            {remainingStories.map((story) => (
              <StoryCard key={story.id} story={story} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export default NewsWidget;

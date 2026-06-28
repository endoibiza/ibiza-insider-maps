import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, Ban, ExternalLink, Lock, Radio, ShieldCheck } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { useAuth } from "@/components/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import {
  formatMadridDateTime,
  getSignalSourceLabel,
  SIGNAL_CATEGORY_LABELS,
  SignalCategory,
  SignalDigestItem,
  SignalDigestRun,
  signalCategoryStyle,
} from "@/lib/signals";
import { cn } from "@/lib/utils";

type SignalQueryResult = {
  data: unknown[] | null;
  error: Error | null;
};

type SignalQueryBuilder = {
  select: (columns: string) => SignalQueryBuilder;
  order: (column: string, options?: { ascending?: boolean }) => SignalQueryBuilder;
  limit: (count: number) => Promise<SignalQueryResult>;
};

type SignalSupabaseClient = {
  from: (relation: string) => SignalQueryBuilder;
};

const signalSupabase = supabase as unknown as SignalSupabaseClient;

const signalCategories: Array<"all" | SignalCategory> = [
  "all",
  "local_breaking_news",
  "government_municipal",
  "weather_alert_chatter",
  "events_lineup_changes",
  "transport_public_safety",
  "tourism_community",
  "source_hint",
];

const describeRunIssue = (issue: Record<string, unknown>) => {
  const source = issue.source_key || issue.source || issue.label || "Source";
  const reason = issue.reason || issue.error || issue.credential_name || "Needs review";
  return `${String(source)}: ${String(reason)}`;
};

const fetchSignalOpsData = async () => {
  const [{ data: runs, error: runsError }, { data: items, error: itemsError }] = await Promise.all([
    signalSupabase
      .from("x_digest_runs")
      .select("id,run_type,mode,status,target_date,started_at,finished_at,sources_seen,snapshots_inserted,items_seen,items_stored,duplicates_seen,credential_requirements,skipped_sources,source_failures,cost_metadata")
      .order("started_at", { ascending: false })
      .limit(8),
    signalSupabase
      .from("x_signal_operator_dashboard")
      .select("id,digest_date,category,title,summary,source_url,source_domain,source_timestamp,source_type,source_kind,source_score,verification_status,privacy_status,created_at,source_label,run_status,run_mode,target_type,link_status")
      .order("created_at", { ascending: false })
      .limit(80),
  ]);

  if (runsError) throw runsError;
  if (itemsError) throw itemsError;

  return {
    runs: (runs ?? []) as SignalDigestRun[],
    items: (items ?? []) as SignalDigestItem[],
  };
};

const SignalOpsPage = () => {
  const { user, loading } = useAuth();
  const [category, setCategory] = useState<"all" | SignalCategory>("all");
  const { data, isLoading, error } = useQuery({
    queryKey: ["signal-ops"],
    queryFn: fetchSignalOpsData,
    enabled: Boolean(user),
    retry: false,
  });

  const latestRun = data?.runs[0] ?? null;
  const filteredItems = useMemo(() => {
    const items = data?.items ?? [];
    if (category === "all") return items;
    return items.filter((item) => item.category === category);
  }, [category, data?.items]);

  const sourceFailures = latestRun?.source_failures?.length ?? 0;
  const skippedSources = latestRun?.skipped_sources?.length ?? 0;
  const credentialRequirements = latestRun?.credential_requirements?.length ?? 0;
  const paidOrCredentialedIssues = [
    ...(latestRun?.credential_requirements ?? []),
    ...(latestRun?.skipped_sources ?? []).filter((issue) => {
      const reason = String(issue.reason || issue.credential_name || "").toLowerCase();
      const source = String(issue.source_key || issue.source || "").toLowerCase();
      return reason.includes("credential") || reason.includes("paid") || source.includes("xai") || source.includes("x-");
    }),
  ];

  if (loading) {
    return <div className="min-h-screen bg-slate-50" />;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50">
        <SEOHead
          title="Signal Ops | Ibiza Maps"
          description="Private Ibiza Maps signal operations surface."
          canonicalPath="/ops/signals"
          robots="noindex, nofollow"
        />
        <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center">
          <Lock className="mb-4 h-10 w-10 text-muted-foreground" />
          <h1 className="text-2xl font-semibold">Private signal operations</h1>
          <p className="mt-3 text-sm text-muted-foreground">Sign in with an authorized Ibiza Maps account.</p>
          <Button asChild className="mt-6">
            <Link to="/auth">Sign in</Link>
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <SEOHead
        title="Signal Ops | Ibiza Maps"
        description="Private Ibiza Maps signal evidence dashboard."
        canonicalPath="/ops/signals"
        robots="noindex, nofollow"
      />

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Link to="/" className="text-lg font-semibold text-primary">
            Ibiza Maps
          </Link>
          <Badge variant="outline" className="ml-auto border-slate-300 bg-slate-50 text-slate-700">
            Private
          </Badge>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wider text-primary">Signal evidence</p>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Ibiza Signal Ops</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Private source-backed hints for News, Weather, and Events review.
            </p>
          </div>
          {latestRun && (
            <div className="text-sm text-muted-foreground">
              Last run {formatMadridDateTime(latestRun.started_at)}
            </div>
          )}
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-5 text-amber-900">
            <div className="flex items-start gap-3">
              <Lock className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <h2 className="font-semibold">Signal data is private</h2>
                <p className="mt-1 text-sm">
                  This account is signed in, but it does not have signal operator access yet.
                </p>
              </div>
            </div>
          </div>
        )}

        {!error && (
          <>
            <div className="mb-6 grid gap-3 md:grid-cols-4">
              <Card className="border-slate-200">
                <CardContent className="flex items-center gap-3 p-4">
                  <Activity className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
                    <p className="font-semibold capitalize">{latestRun?.status ?? "No runs"}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-slate-200">
                <CardContent className="flex items-center gap-3 p-4">
                  <Radio className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Signals</p>
                    <p className="font-semibold">{latestRun?.items_stored ?? 0} stored</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-slate-200">
                <CardContent className="flex items-center gap-3 p-4">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Sources</p>
                    <p className="font-semibold">{latestRun?.sources_seen ?? 0} checked</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-slate-200">
                <CardContent className="flex items-center gap-3 p-4">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Needs attention</p>
                    <p className="font-semibold">{sourceFailures + skippedSources + credentialRequirements}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="mb-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
              <Card className="border-emerald-200 bg-emerald-50/70">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                    <div>
                      <h2 className="font-semibold text-emerald-950">Private supporting evidence only</h2>
                      <p className="mt-1 text-sm text-emerald-900">
                        These rows can guide News, Weather, and Events review, but they do not publish public facts without a source-backed confirmation step.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 bg-white">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <Ban className="mt-0.5 h-5 w-5 shrink-0 text-slate-700" />
                    <div>
                      <h2 className="font-semibold">Paid X/xAI status</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Official X and Grok paths stay disabled until credentials and spending caps are approved.
                      </p>
                      {paidOrCredentialedIssues.length > 0 && (
                        <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                          {paidOrCredentialedIssues.slice(0, 3).map((issue, index) => (
                            <li key={`${describeRunIssue(issue)}-${index}`}>{describeRunIssue(issue)}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Tabs value={category} onValueChange={(value) => setCategory(value as "all" | SignalCategory)} className="mb-5">
              <TabsList className="h-auto flex-wrap justify-start bg-white">
                {signalCategories.map((value) => (
                  <TabsTrigger key={value} value={value} className="text-xs">
                    {value === "all" ? "All" : SIGNAL_CATEGORY_LABELS[value]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {isLoading && (
              <div className="grid gap-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="h-32 animate-pulse rounded-lg bg-white" />
                ))}
              </div>
            )}

            {!isLoading && filteredItems.length === 0 && (
              <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
                <Radio className="mx-auto mb-4 h-9 w-9 text-muted-foreground" />
                <h2 className="text-xl font-semibold">No signal evidence yet</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  The next scheduled collector run will populate this view once the migration and function are deployed.
                </p>
              </div>
            )}

            {!isLoading && filteredItems.length > 0 && (
              <div className="grid gap-3">
                {filteredItems.map((item) => (
                  <Card key={item.id} className="border-slate-200">
                    <CardContent className="p-5">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className={cn("px-2 py-0.5", signalCategoryStyle(item.category))}>
                              {SIGNAL_CATEGORY_LABELS[item.category]}
                            </Badge>
                            <Badge variant="secondary">{item.verification_status.replaceAll("_", " ")}</Badge>
                            <Badge variant="outline">Score {item.source_score}</Badge>
                            {item.target_type && <Badge variant="outline">{item.target_type.replaceAll("_", " ")}</Badge>}
                          </div>
                          <h2 className="text-lg font-semibold leading-snug">{item.title}</h2>
                          {item.summary && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{item.summary}</p>}
                        </div>
                        <Button asChild size="sm" variant="outline" className="shrink-0 gap-2">
                          <a href={item.source_url} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-4 w-4" />
                            Source
                          </a>
                        </Button>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                        <span>{getSignalSourceLabel(item)}</span>
                        <span>{formatMadridDateTime(item.source_timestamp || item.created_at)}</span>
                        <span>{item.source_kind.replaceAll("_", " ")}</span>
                        <span>{item.privacy_status}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default SignalOpsPage;

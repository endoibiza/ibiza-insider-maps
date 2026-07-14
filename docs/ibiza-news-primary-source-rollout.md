# Ibiza News Primary-Source Rollout

This change is intentionally shadow-first. Deploying the foundation does not
enable the newly audited media feeds or turn on the strict primary-source gate.

## Ownership

- Runtime, schema, functions, and schedules: `endoibiza/ibiza-insider-maps`
- Public News frontend: `endoibiza/ibiza-maps-215cce0d`
- Daily runtime remains GitHub Actions plus Supabase and does not require a
  laptop, Notion Agent, Codex, Hermes, or OpenClaw.

## Source Policy

- Ibiza Spotlight remains private discovery evidence only. Its URLs are
  excluded from `ibiza_news_public`.
- Official authorities, municipalities, venues, organizers, and business-owned
  pages are preferred as canonical evidence.
- Trusted publishers remain eligible for interviews, investigations, court and
  incident reporting when no meaningful primary page exists.
- Events, openings, government announcements, transport service changes,
  weather alerts, and emergency instructions require primary evidence.
- Only feed metadata and short excerpts are stored. Article bodies are not
  fetched or republished.

## Foundation Deployment Approval

One bounded production approval should cover only:

1. Apply `20260714070459_news_primary_source_evidence.sql`.
2. Deploy `collect-ibiza-signals`, `resolve-ibiza-signals`,
   `collect-ibiza-news`, and `get-news`.
3. Push the two News workflow changes.
4. Do not enable new sources and do not set
   `enforce_primary_resolution=true` yet.

The migration registers Noudiari, Onda Cero Ibiza, IB3 Eivissa, Ràdio Illa,
TEF, Majorca Daily Bulletin, and COPE Ibiza as disabled sources. COPE remains
disabled because its official feed was stale during the July 2026 audit.

## Two-Day Shadow Check

Run `collect-ibiza-signals` with these explicit source keys so disabled rows can
be audited without scheduled activation:

```text
noudiari-rss,onda-cero-ibiza-rss,ib3-eivissa-rss,radio-illa-actualitat-rss,tef-rss,majorca-daily-bulletin-atom
```

Use `dry_run=false`; this stores private signal evidence only. Then invoke
`resolve-ibiza-signals` with the same date and `dry_run=false`. It writes only
private resolution links and a private resolution run log.

Accept the source set only when both days show:

- zero Spotlight URLs eligible for public use;
- zero false-local Majorca Daily Bulletin items;
- no obituary/programme-feed noise promoted;
- no quantity/date/location conflict marked confirmed;
- useful unique-story yield after incident dedupe;
- official/owner resolution for announcements and event discoveries;
- publisher-original status limited to legitimate original reporting.

## Activation Approval

Activation is a separate migration/PR after the shadow evidence is reviewed:

- enable accepted rows in `x_signal_sources`;
- enable matching `news_sources` rows with `publish_mode='review'` only when
  resolved-signal promotion is accepted;
- leave TEF and Majorca Daily Bulletin review/supporting-only unless their
  signal quality proves consistently useful;
- keep COPE disabled and re-audit quarterly;
- keep Radio Ibiza SER unconfigured until a stable permitted feed exists;
- change the scheduled News workflow to pass
  `enforce_primary_resolution=true` only after one successful manual publish.

## Verification Queries

```sql
select target_date, status, signals_seen, official_matches,
       publisher_originals, review_required, event_candidates, conflicts
from public.news_resolution_runs
order by started_at desc
limit 10;

select source_key, count(*)
from public.x_daily_digest_items
where digest_date >= current_date - 2
group by source_key
order by source_key;

select source_resolution_status, count(*)
from public.ibiza_news_stories
where story_date >= current_date - 2
group by source_resolution_status;

select count(*) as public_spotlight_urls
from public.ibiza_news_public
where source_url ~* 'ibiza-spotlight\.com';
```

The final query must return `0`.

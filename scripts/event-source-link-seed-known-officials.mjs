import { createClient } from "@supabase/supabase-js";

const requiredEnv = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
const apply = String(process.env.APPLY || "false").toLowerCase() === "true";

const sha256 = async (value) => {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const officialSeeds = [
  {
    label: "Hï Ibiza CamelPhat Summer of Love 2026",
    venue: "Hï Ibiza",
    eventNamePattern: "%CamelPhat%",
    sourceUrl: "https://www.hiibiza.com/events/2026/camelphat",
    startDate: "2026-07-05",
    endDate: "2026-10-02",
    sourceType: "official_venue",
    sourceKey: "known-official-source-seed",
    monetizable: false,
    confidence: 0.92,
  },
  {
    label: "Club Chinois La Troya 31 Aug 2026 public Fourvenues page",
    venue: "Club Chinois",
    eventNamePattern: "%La Troya%",
    sourceUrl: "https://site.fourvenues.com/en/chinois-ibiza/events/la-troya-31-08-2026-VPDF",
    startDate: "2026-08-31",
    endDate: "2026-08-31",
    sourceType: "fourvenues_public",
    sourceKey: "known-fourvenues-public-source-seed",
    monetizable: false,
    confidence: 0.9,
    proposedLineup: "David Penn, Kpd, Oscar Colorado, Sanchez",
  },
  {
    label: "Club Chinois La Troya 21 Sep 2026 public Fourvenues page",
    venue: "Club Chinois",
    eventNamePattern: "%La Troya%",
    sourceUrl: "https://site.fourvenues.com/en/chinois-ibiza/events/la-troya-21-09-2026-QF2Z",
    startDate: "2026-09-21",
    endDate: "2026-09-21",
    sourceType: "fourvenues_public",
    sourceKey: "known-fourvenues-public-source-seed",
    monetizable: false,
    confidence: 0.9,
    proposedLineup: "Hannah Wants, Jodie Harsh, Oscar Colorado, Rampini",
  },
  {
    label: "Club Chinois Defected 25 Jun 2026 public Fourvenues page",
    venue: "Club Chinois",
    eventNamePattern: "%Defected%",
    sourceUrl:
      "https://site.fourvenues.com/en/chinois-ibiza/events/defected-dj-ez-hannah-wants-james-poole-murphys-law-phill-de-janeiro-25-06-2026-XYVE",
    startDate: "2026-06-25",
    endDate: "2026-06-25",
    sourceType: "fourvenues_public",
    sourceKey: "known-fourvenues-public-source-seed",
    monetizable: false,
    confidence: 0.9,
    proposedLineup: "DJ EZ, Hannah Wants, James Poole, Murphy's Law, Phill De Janeiro",
  },
];

const summary = [];

for (const seed of officialSeeds) {
  const { data: events, error } = await supabase
    .from("ibiza_events")
    .select("id,event_name,date,venue,event_url,lineup_details,notion_page_id,fourvenues_event_id")
    .eq("venue", seed.venue)
    .ilike("event_name", seed.eventNamePattern)
    .gte("date", seed.startDate)
    .lte("date", seed.endDate)
    .neq("status", "Cancelled")
    .is("source_missing_since", null)
    .order("date", { ascending: true });

  if (error) throw error;

  const eligibleEvents = (events || []).filter(
    (event) => !event.fourvenues_event_id && !String(event.notion_page_id || "").startsWith("fourvenues:"),
  );

  let upserts = 0;
  let proposalUpserts = 0;
  if (apply && eligibleEvents.length) {
    const rows = eligibleEvents.map((event) => ({
      event_id: event.id,
      source_url: seed.sourceUrl,
      source_type: seed.sourceType || "official_venue",
      source_key: seed.sourceKey || "known-official-source-seed",
      source_label: seed.label,
      canonical_for_updates: true,
      monetizable: seed.monetizable || false,
      confidence: seed.confidence,
      last_checked_at: new Date().toISOString(),
      status: "active",
      raw_metadata: {
        seeded_from: "known_official_source_seed",
        seed_label: seed.label,
        event_name: event.event_name,
        event_date: event.date,
        existing_event_url: event.event_url,
      },
    }));

    const { error: upsertError } = await supabase
      .from("event_source_links")
      .upsert(rows, { onConflict: "event_id,source_url" });

    if (upsertError) throw upsertError;
    upserts = rows.length;

    if (seed.proposedLineup) {
      const proposalRows = [];

      for (const event of eligibleEvents) {
        const proposalHash = await sha256(`${event.id}|${seed.sourceUrl}|${seed.proposedLineup}`);
        const { data: existingProposals, error: existingProposalError } = await supabase
          .from("event_lineup_review_queue")
          .select("id,approval_status")
          .eq("event_id", event.id)
          .eq("source_url", seed.sourceUrl)
          .eq("proposal_hash", proposalHash)
          .limit(1);

        if (existingProposalError) throw existingProposalError;

        const existingStatus = existingProposals?.[0]?.approval_status;
        if (["applied", "rejected"].includes(existingStatus)) continue;

        proposalRows.push({
          event_id: event.id,
          source_url: seed.sourceUrl,
          source_type: seed.sourceType || "official_venue",
          event_name: event.event_name,
          event_date: event.date,
          venue: event.venue,
          current_lineup_details: event.lineup_details,
          proposed_lineup_details: seed.proposedLineup,
          proposal_hash: proposalHash,
          lineup_confidence: seed.confidence,
          approval_status: existingStatus || "pending",
          raw_metadata: {
            seeded_from: "known_official_source_seed",
            seed_label: seed.label,
            quality_gate: "seeded_exact_public_source_pending_review",
            evidence_note: "Exact date-specific public source verified before staging. Public ibiza_events row not updated by this workflow.",
          },
        });
      }

      if (proposalRows.length) {
        const { error: proposalError } = await supabase
          .from("event_lineup_review_queue")
          .upsert(proposalRows, { onConflict: "event_id,source_url,proposal_hash" });

        if (proposalError) throw proposalError;
      }
      proposalUpserts = proposalRows.length;
    }
  }

  summary.push({
    label: seed.label,
    source_url: seed.sourceUrl,
    matched_events: eligibleEvents.length,
    upserted_source_links: upserts,
    upserted_lineup_proposals: proposalUpserts,
    sample_events: eligibleEvents.slice(0, 20).map((event) => ({
      date: event.date,
      venue: event.venue,
      event_name: event.event_name,
      current_event_url: event.event_url,
      current_lineup_details: event.lineup_details,
    })),
  });
}

console.log(JSON.stringify({ apply, seeds_checked: officialSeeds.length, summary }, null, 2));

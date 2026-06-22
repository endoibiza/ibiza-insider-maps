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
    sourceUrl: "https://site.fourvenues.com/en/chinois-ibiza/events/la-troya-david-penn-kpd-oscar-colorado-sanchez-31-08-2026-VPDF",
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
  {
    label: "Club Chinois Mahmut Orhan 22 Jul 2026 public Fourvenues page",
    venue: "Club Chinois",
    eventNamePattern: "%Mahmut Orhan%",
    sourceUrl: "https://site.fourvenues.com/en/chinois-ibiza/events/mahmut-orhan-22-07-2026-I92U",
    startDate: "2026-07-22",
    endDate: "2026-07-22",
    sourceType: "fourvenues_public",
    sourceKey: "known-fourvenues-public-source-seed",
    monetizable: false,
    confidence: 0.9,
    proposedLineup: "Mahmut Orhan, Zhu, Sam Shure b2b Ace Brothers",
  },
  {
    label: "Club Chinois Mahmut Orhan 5 Aug 2026 public Fourvenues page",
    venue: "Club Chinois",
    eventNamePattern: "%Mahmut Orhan%",
    sourceUrl: "https://site.fourvenues.com/en/chinois-ibiza/events/mahmut-orhan-05-08-2026-ZSNZ",
    startDate: "2026-08-05",
    endDate: "2026-08-05",
    sourceType: "fourvenues_public",
    sourceKey: "known-fourvenues-public-source-seed",
    monetizable: false,
    confidence: 0.9,
    proposedLineup: "Isa Roos, Benja b2b Franc Fala, Volkoder, Mahmut Orhan",
  },
  {
    label: "Ushuaïa Calvin Harris 4 Sep 2026 official page",
    venue: "Ushuaïa Ibiza",
    eventNamePattern: "%Calvin Harris%",
    sourceUrl: "https://www.theushuaiaexperience.com/en/club/events/calvin-harris-on-2026-09-04",
    startDate: "2026-09-04",
    endDate: "2026-09-04",
    sourceType: "official_venue",
    sourceKey: "known-official-source-seed",
    monetizable: false,
    confidence: 0.94,
    proposedLineup: "Calvin Harris, MK, Illyus Barrientos, Tyson O'Brien",
  },
  {
    label: "Ushuaïa Calvin Harris 11 Sep 2026 official page",
    venue: "Ushuaïa Ibiza",
    eventNamePattern: "%Calvin Harris%",
    sourceUrl: "https://www.theushuaiaexperience.com/en/club/events/calvin-harris-on-2026-09-11",
    startDate: "2026-09-11",
    endDate: "2026-09-11",
    sourceType: "official_venue",
    sourceKey: "known-official-source-seed",
    monetizable: false,
    confidence: 0.94,
    proposedLineup: "Calvin Harris, MK, Tyson O'Brien, OFFAIAH",
  },
  {
    label: "Ushuaïa Martin Garrix 17 Sep 2026 official page",
    venue: "Ushuaïa Ibiza",
    eventNamePattern: "%Martin Garrix%",
    sourceUrl: "https://www.theushuaiaexperience.com/en/club/events/martin-garrix-on-2026-09-17",
    startDate: "2026-09-17",
    endDate: "2026-09-17",
    sourceType: "official_venue",
    sourceKey: "known-official-source-seed",
    monetizable: false,
    confidence: 0.94,
    proposedLineup: "Martin Garrix, The Magician, Low Steppa, Megisto",
  },
  {
    label: "Ushuaïa Calvin Harris 18 Sep 2026 official page",
    venue: "Ushuaïa Ibiza",
    eventNamePattern: "%Calvin Harris%",
    sourceUrl: "https://www.theushuaiaexperience.com/en/club/events/calvin-harris-on-2026-09-18",
    startDate: "2026-09-18",
    endDate: "2026-09-18",
    sourceType: "official_venue",
    sourceKey: "known-official-source-seed",
    monetizable: false,
    confidence: 0.94,
    proposedLineup: "Calvin Harris, MK, Eats Everything, Tyson O'Brien",
  },
  {
    label: "Ushuaïa Martin Garrix 24 Sep 2026 official page",
    venue: "Ushuaïa Ibiza",
    eventNamePattern: "%Martin Garrix%",
    sourceUrl: "https://www.theushuaiaexperience.com/en/club/events/martin-garrix-on-2026-09-24",
    startDate: "2026-09-24",
    endDate: "2026-09-24",
    sourceType: "official_venue",
    sourceKey: "known-official-source-seed",
    monetizable: false,
    confidence: 0.94,
    proposedLineup: "Martin Garrix, Mesto, Citadelle, Gabss",
  },
  {
    label: "Ushuaïa Calvin Harris 25 Sep 2026 official page",
    venue: "Ushuaïa Ibiza",
    eventNamePattern: "%Calvin Harris%",
    sourceUrl: "https://www.theushuaiaexperience.com/en/club/events/calvin-harris-on-2026-09-25",
    startDate: "2026-09-25",
    endDate: "2026-09-25",
    sourceType: "official_venue",
    sourceKey: "known-official-source-seed",
    monetizable: false,
    confidence: 0.94,
    proposedLineup: "Calvin Harris, MK, Tyson O'Brien, Storm Mollison",
  },
  {
    label: "Amnesia You&Me 16 Jul 2026 official ticketing page",
    venue: "Amnesia Ibiza",
    eventNamePattern: "%You%Me%",
    sourceUrl: "https://sales.ticketing.cm.com/YouandMe-Amnesia-16thJuly2026",
    startDate: "2026-07-16",
    endDate: "2026-07-16",
    sourceType: "ticketing_platform",
    sourceKey: "known-official-ticketing-source-seed",
    monetizable: false,
    confidence: 0.93,
  },
  {
    label: "Amnesia Glitterbox 17 Jul 2026 official ticketing page",
    venue: "Amnesia Ibiza",
    eventNamePattern: "%Glitterbox%",
    sourceUrl: "https://sales.ticketing.cm.com/Glitterbox-Amnesia-17thJuly2026",
    startDate: "2026-07-17",
    endDate: "2026-07-17",
    sourceType: "ticketing_platform",
    sourceKey: "known-official-ticketing-source-seed",
    monetizable: false,
    confidence: 0.93,
  },
  {
    label: "Amnesia Bresh 18 Jul 2026 official ticketing page",
    venue: "Amnesia Ibiza",
    eventNamePattern: "%Bresh%",
    sourceUrl: "https://sales.ticketing.cm.com/Bresh-Amnesia-18thJuly2026",
    startDate: "2026-07-18",
    endDate: "2026-07-18",
    sourceType: "ticketing_platform",
    sourceKey: "known-official-ticketing-source-seed",
    monetizable: false,
    confidence: 0.93,
  },
  {
    label: "Amnesia Metamorfosi 21 Jul 2026 official ticketing page",
    venue: "Amnesia Ibiza",
    eventNamePattern: "%Metamorfosi%",
    sourceUrl: "https://sales.ticketing.cm.com/Metamorfosi-Amnesia-21stJuly2026",
    startDate: "2026-07-21",
    endDate: "2026-07-21",
    sourceType: "ticketing_platform",
    sourceKey: "known-official-ticketing-source-seed",
    monetizable: false,
    confidence: 0.93,
  },
  {
    label: "Amnesia You&Me 23 Jul 2026 official ticketing page",
    venue: "Amnesia Ibiza",
    eventNamePattern: "%You%Me%",
    sourceUrl: "https://sales.ticketing.cm.com/YouandMe-Amnesia-23rdJuly2026",
    startDate: "2026-07-23",
    endDate: "2026-07-23",
    sourceType: "ticketing_platform",
    sourceKey: "known-official-ticketing-source-seed",
    monetizable: false,
    confidence: 0.93,
  },
  {
    label: "Amnesia Glitterbox 24 Jul 2026 official ticketing page",
    venue: "Amnesia Ibiza",
    eventNamePattern: "%Glitterbox%",
    sourceUrl: "https://sales.ticketing.cm.com/Glitterbox-Amnesia-24thJuly2026",
    startDate: "2026-07-24",
    endDate: "2026-07-24",
    sourceType: "ticketing_platform",
    sourceKey: "known-official-ticketing-source-seed",
    monetizable: false,
    confidence: 0.93,
  },
  {
    label: "Amnesia Pyramid 26 Jul 2026 official ticketing page",
    venue: "Amnesia Ibiza",
    eventNamePattern: "%Pyramid%",
    sourceUrl: "https://sales.ticketing.cm.com/Pyramid-Amnesia-26thJuly2026",
    startDate: "2026-07-26",
    endDate: "2026-07-26",
    sourceType: "ticketing_platform",
    sourceKey: "known-official-ticketing-source-seed",
    monetizable: false,
    confidence: 0.93,
  },
  {
    label: "Amnesia You&Me 30 Jul 2026 official ticketing page",
    venue: "Amnesia Ibiza",
    eventNamePattern: "%You%Me%",
    sourceUrl: "https://sales.ticketing.cm.com/YouandMe-Amnesia-30thJuly2026",
    startDate: "2026-07-30",
    endDate: "2026-07-30",
    sourceType: "ticketing_platform",
    sourceKey: "known-official-ticketing-source-seed",
    monetizable: false,
    confidence: 0.93,
  },
  {
    label: "Tomodachi Real Gang 23 Jun 2026 Shotgun page",
    venue: "Tomodachi Ibiza",
    eventNamePattern: "%Real Gang%",
    sourceUrl: "https://shotgun.live/en/events/realgang-summer-8",
    startDate: "2026-06-23",
    endDate: "2026-06-23",
    sourceType: "ticketing_platform",
    sourceKey: "known-shotgun-source-seed",
    monetizable: false,
    confidence: 0.92,
    proposedLineup: "Mathew Jonson (Live), Evgheniia",
  },
  {
    label: "Tomodachi X Chemarea 25 Jun 2026 Shotgun page",
    venue: "Tomodachi Ibiza",
    eventNamePattern: "%Tomodachi%Chemarea%",
    sourceUrl: "https://shotgun.live/en/events/tomodachi-summer-53",
    startDate: "2026-06-25",
    endDate: "2026-06-25",
    sourceType: "ticketing_platform",
    sourceKey: "known-shotgun-source-seed",
    monetizable: false,
    confidence: 0.92,
    proposedLineup: "Dan Andrei, JP Mandoiu",
  },
  {
    label: "Tomodachi 26 Jun 2026 Shotgun page",
    venue: "Tomodachi Ibiza",
    eventNamePattern: "%Tomodachi%",
    sourceUrl: "https://shotgun.live/en/events/tomodachi-summer-20",
    startDate: "2026-06-26",
    endDate: "2026-06-26",
    sourceType: "ticketing_platform",
    sourceKey: "known-shotgun-source-seed",
    monetizable: false,
    confidence: 0.9,
  },
  {
    label: "Tomodachi 27 Jun 2026 Shotgun page",
    venue: "Tomodachi Ibiza",
    eventNamePattern: "%Tomodachi%",
    sourceUrl: "https://shotgun.live/en/events/tomodachi-summer-21",
    startDate: "2026-06-27",
    endDate: "2026-06-27",
    sourceType: "ticketing_platform",
    sourceKey: "known-shotgun-source-seed",
    monetizable: false,
    confidence: 0.92,
    proposedLineup: "Tomodachi All Stars",
  },
  {
    label: "Tomodachi Real Gang 30 Jun 2026 Shotgun page",
    venue: "Tomodachi Ibiza",
    eventNamePattern: "%Real Gang%",
    sourceUrl: "https://shotgun.live/en/events/realgang-summer-9",
    startDate: "2026-06-30",
    endDate: "2026-06-30",
    sourceType: "ticketing_platform",
    sourceKey: "known-shotgun-source-seed",
    monetizable: false,
    confidence: 0.92,
    proposedLineup: "Tristan Da Cunha, Miller, Nicolau",
  },
  {
    label: "Tomodachi 3 Jul 2026 Shotgun page",
    venue: "Tomodachi Ibiza",
    eventNamePattern: "%Tomodachi%",
    sourceUrl: "https://shotgun.live/en/events/tomodachi-summer-22",
    startDate: "2026-07-03",
    endDate: "2026-07-03",
    sourceType: "ticketing_platform",
    sourceKey: "known-shotgun-source-seed",
    monetizable: false,
    confidence: 0.9,
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
            source_key: seed.sourceKey || "known-official-source-seed",
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
            source_key: seed.sourceKey || "known-official-source-seed",
            event_date: event.date,
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

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.env.APPLY === "true";

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

const sourceRows = [
  {
    date: "2026-06-28",
    series: "Pantheøn",
    source_url: "https://www.ibiza-spotlight.com/night/promoters/pantheon",
    lineup_details: "Dany Gomez, Harvy Valencia, Rafa Barrios, Sirus Hood",
  },
  {
    date: "2026-07-05",
    series: "Pantheøn",
    source_url: "https://www.ibiza-spotlight.com/night/promoters/pantheon",
    lineup_details: "Levi + more TBA",
  },
  {
    date: "2026-07-12",
    series: "Pantheøn",
    source_url: "https://www.ibiza-spotlight.com/night/promoters/pantheon",
    lineup_details: "Mr. Belt & Wezol, TSHA + more TBA",
  },
  {
    date: "2026-07-19",
    series: "Pantheøn",
    source_url: "https://www.ibiza-spotlight.com/night/promoters/pantheon",
    lineup_details: "Levi + more TBA",
  },
  {
    date: "2026-07-26",
    series: "Pantheøn",
    source_url: "https://www.ibiza-spotlight.com/night/promoters/pantheon",
    lineup_details: "Kerri Chandler, Manda Moor, wAFF, Yaya",
  },
  {
    date: "2026-08-02",
    series: "Pantheøn",
    source_url: "https://www.ibiza-spotlight.com/night/promoters/pantheon",
    lineup_details: "Levi + more TBA",
  },
  {
    date: "2026-08-09",
    series: "Pantheøn",
    source_url: "https://www.ibiza-spotlight.com/night/promoters/pantheon",
    lineup_details: "Chinonegro, D.O.D., Matthias Tanzmann + more TBA",
  },
  {
    date: "2026-08-16",
    series: "Pantheøn",
    source_url: "https://www.ibiza-spotlight.com/night/promoters/pantheon",
    lineup_details: "Hector Couto, JNJS (Jay Nortown & Jacobo Saavedra), Solardo",
  },
  {
    date: "2026-08-23",
    series: "Pantheøn",
    source_url: "https://www.ibiza-spotlight.com/night/promoters/pantheon",
    lineup_details: "Dunmore Brothers, Manda Moor, Mr. Belt & Wezol",
  },
  {
    date: "2026-08-30",
    series: "Pantheøn",
    source_url: "https://www.ibiza-spotlight.com/night/promoters/pantheon",
    lineup_details: "Agoria, HoneyLuv + more TBA",
  },
  {
    date: "2026-09-06",
    series: "Pantheøn",
    source_url: "https://www.ibiza-spotlight.com/night/promoters/pantheon",
    lineup_details: "Butch, Gome, LF System",
  },
  {
    date: "2026-09-13",
    series: "Pantheøn",
    source_url: "https://www.ibiza-spotlight.com/night/promoters/pantheon",
    lineup_details: "Mr. Belt & Wezol, Sem Jacobs + more TBA",
  },
  {
    date: "2026-06-30",
    series: "PIV",
    source_url: "https://www.ibiza-spotlight.com/night/promoters/piv-label-showcase",
    lineup_details: "II Faces, Anil Aras, Jay de Lys, Locklead, M-High, Shae Reid",
  },
  {
    date: "2026-07-07",
    series: "PIV",
    source_url: "https://www.ibiza-spotlight.com/night/promoters/piv-label-showcase",
    lineup_details: "Burnski, Cinthie, D-Stone, Dam Swindle, Elvi",
  },
  {
    date: "2026-07-14",
    series: "PIV",
    source_url: "https://www.ibiza-spotlight.com/night/promoters/piv-label-showcase",
    lineup_details: "Di Chiara Brothers, Kirik, Minnu, Ruze, Stacie Fields",
  },
  {
    date: "2026-07-21",
    series: "PIV",
    source_url: "https://www.ibiza-spotlight.com/night/promoters/piv-label-showcase",
    lineup_details: "Cam Stockman, Eli Samuel, Klaudie, Mad.Again, M-High, Robbie Doherty",
  },
  {
    date: "2026-07-28",
    series: "PIV",
    source_url: "https://www.ibiza-spotlight.com/night/promoters/piv-label-showcase",
    lineup_details: "Candidate, George Smeddles, Klaudie, Michel de Hey, Olive F, Prunk",
  },
  {
    date: "2026-08-04",
    series: "PIV",
    source_url: "https://www.ibiza-spotlight.com/night/promoters/piv-label-showcase",
    lineup_details: "Chez Damier, DXNBY, Max Kiilian, Ozzie Guven, Phill de Janeiro, Rio Tashan, Saigon",
  },
  {
    date: "2026-08-11",
    series: "PIV",
    source_url: "https://www.ibiza-spotlight.com/night/promoters/piv-label-showcase",
    lineup_details: "Emvae & Moxes, Job de Jong, Kamma & Masalo, Melody, Yass & Mali",
  },
  {
    date: "2026-08-18",
    series: "PIV",
    source_url: "https://www.ibiza-spotlight.com/night/promoters/piv-label-showcase",
    lineup_details: "Chiara Kidd, Grant Nelson, Josh Holland, Kellie Allen, Midas Field, Ms. Mada, Prunk, Retrouve, Romeo Louisa",
  },
  {
    date: "2026-08-25",
    series: "PIV",
    source_url: "https://www.ibiza-spotlight.com/night/promoters/piv-label-showcase",
    lineup_details: "Demi Riquisimo, Garett David, Job de Jong, Klaudie, Lauren Lo Sung, Lulah Francs, M.O.N.R.O.E.",
  },
  {
    date: "2026-09-01",
    series: "PIV",
    source_url: "https://www.ibiza-spotlight.com/night/promoters/piv-label-showcase",
    lineup_details: "AAT, Anil Aras, Contest Winner, Lauren Lo Sung, Locklead, Prunk",
  },
  {
    date: "2026-09-08",
    series: "PIV",
    source_url: "https://www.ibiza-spotlight.com/night/promoters/piv-label-showcase",
    lineup_details: "Baka G, Cinthie, Darius Syrossian, Easttown, Laura Solar, Lewis Taylor, Prunk",
  },
  {
    date: "2026-09-15",
    series: "PIV",
    source_url: "https://www.ibiza-spotlight.com/night/promoters/piv-label-showcase",
    lineup_details: "Dam Swindle, Inland Knights, Isaac Carter, Li-Yu, Makez, Midas Field",
  },
  {
    date: "2026-09-22",
    series: "PIV",
    source_url: "https://www.ibiza-spotlight.com/night/promoters/piv-label-showcase",
    lineup_details: "Ella Knight, Jansons, Job de Jong, Paisley Jensen, Prunk, Rich NxT",
  },
  {
    date: "2026-09-29",
    series: "PIV",
    source_url: "https://www.ibiza-spotlight.com/night/promoters/piv-label-showcase",
    lineup_details: "Boss Priester, DiOsa, Klaudie, Nautica, Prunk, Riordan, TSHA",
  },
  {
    date: "2026-07-30",
    series: "AMÉMÉ",
    source_url: "https://www.ibiza-spotlight.com/night/promoters/ameme-cova-santa",
    lineup_details: "AMÉMÉ, Jamiie, KILIMANJARO, LP Giobbi, Nenahalena, Yung Omz",
  },
  {
    date: "2026-08-06",
    series: "AMÉMÉ",
    source_url: "https://www.ibiza-spotlight.com/night/promoters/ameme-cova-santa",
    lineup_details: "AMÉMÉ, HoneyLuv, Nenahalena, Rockin Morrocin, Shamiso B2B Aniko, Ukai Ndame",
  },
  {
    date: "2026-08-13",
    series: "AMÉMÉ",
    source_url: "https://www.ibiza-spotlight.com/night/promoters/ameme-cova-santa",
    lineup_details: "AMÉMÉ, Awen, Benja B2B Franc Fala, Da Capo, Nenahalena",
  },
  {
    date: "2026-08-20",
    series: "AMÉMÉ",
    source_url: "https://www.ibiza-spotlight.com/night/promoters/ameme-cova-santa",
    lineup_details: "AMÉMÉ, Kasango, Lazare B2B Meloko, Nenahalena, Vanco",
  },
  {
    date: "2026-08-27",
    series: "AMÉMÉ",
    source_url: "https://www.ibiza-spotlight.com/night/promoters/ameme-cova-santa",
    lineup_details: "AMÉMÉ, Cincity B2B Philou Louzolo, Coco & Breezy, Kitty Amor, Nenahalena",
  },
];

const normalize = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`´]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const matchesSeries = (eventName, series) => {
  const name = normalize(eventName);
  if (series === "Pantheøn") return name.includes("panthe") || name.includes("panthen");
  if (series === "PIV") return name.includes("piv");
  if (series === "AMÉMÉ") return name.includes("ameme") || name.includes("one tribe");
  return false;
};

const plan = [];

for (const sourceRow of sourceRows) {
  const params = new URLSearchParams({
    select: "id,event_name,date,venue,lineup_details,event_url,status,source_missing_since",
    venue: "eq.Cova Santa",
    date: `eq.${sourceRow.date}`,
    source_missing_since: "is.null",
  });
  const matches = await request(`ibiza_events?${params.toString()}`);
  const candidates = (matches || []).filter((event) => matchesSeries(event.event_name, sourceRow.series));

  if (candidates.length !== 1) {
    plan.push({
      ...sourceRow,
      action: "skip",
      reason: `expected 1 matching Cova ${sourceRow.series} row, found ${candidates.length}`,
      candidates: (matches || []).map((event) => ({
        date: event.date,
        event_name: event.event_name,
        lineup_details: event.lineup_details,
      })),
    });
    continue;
  }

  const event = candidates[0];
  const current = String(event.lineup_details || "").trim();
  const proposed = sourceRow.lineup_details.trim();
  plan.push({
    ...sourceRow,
    id: event.id,
    event_name: event.event_name,
    current_lineup: current,
    proposed_lineup: proposed,
    action: current === proposed ? "unchanged" : "update_lineup",
  });
}

const updates = plan.filter((item) => item.action === "update_lineup");
const skipped = plan.filter((item) => item.action === "skip");
const unchanged = plan.filter((item) => item.action === "unchanged");

console.log(
  JSON.stringify(
    {
      apply: APPLY,
      source: "Ibiza Spotlight Cova Santa promoter pages",
      planned_rows: plan.length,
      rows_to_update: updates.length,
      unchanged: unchanged.length,
      skipped: skipped.length,
      skipped_preview: skipped,
      update_preview: updates.map((item) => ({
        date: item.date,
        event_name: item.event_name,
        current_lineup: item.current_lineup,
        proposed_lineup: item.proposed_lineup,
        source_url: item.source_url,
      })),
    },
    null,
    2,
  ),
);

if (!APPLY || updates.length === 0) {
  process.exit(0);
}

for (const item of updates) {
  await request(`ibiza_events?id=eq.${item.id}`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({
      lineup_details: item.proposed_lineup,
      last_synced_at: new Date().toISOString(),
    }),
  });
}

await request("sync_log", {
  method: "POST",
  headers: { prefer: "return=minimal" },
  body: JSON.stringify({
    table_name: "ibiza_events_cova_spotlight_lineup_seed",
    records_upserted: updates.length,
    metadata: {
      status: "success",
      source: "Ibiza Spotlight Cova Santa promoter pages",
      planned_rows: plan.length,
      updates: updates.map((item) => ({
        date: item.date,
        event_name: item.event_name,
        proposed_lineup: item.proposed_lineup,
        source_url: item.source_url,
      })),
      skipped,
    },
  }),
});

console.log(
  JSON.stringify(
    {
      apply: APPLY,
      updated_lineups: updates.length,
      skipped: skipped.length,
    },
    null,
    2,
  ),
);

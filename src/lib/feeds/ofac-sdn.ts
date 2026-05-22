/**
 * US Treasury OFAC Specially Designated Nationals (SDN) feed — drives the
 * R-01 (Jurisdictional Concentration) and R-02 (Force Majeure Exposure)
 * axioms with live sanctions data.
 *
 * Source: pipe-delimited SDN.csv published by Treasury OFAC. The file is the
 * official authoritative list of US sanctions designations and is updated
 * whenever Treasury publishes a new tranche (typically several times per
 * week). No API key required; the proxy caches upstream for 24 hours since
 * sanctions don't change minute-by-minute.
 *
 * The feed counts entries per OFAC program, then aggregates programs by
 * country via a static program→country map. The result is a per-jurisdiction
 * activity summary the engine can use to flag high-J nodes whose jurisdiction
 * has active sanctions.
 */

/**
 * Static map from OFAC program token → ISO-3166-1 alpha-2 country code.
 * Programs not in this map (cyber, generic terrorism, non-proliferation) are
 * deliberately excluded — they don't bind to a specific jurisdiction.
 *
 * Source for program tokens: OFAC SDN list documentation. Tokens like
 * "IRAN-EO13599" are matched via the leading prefix.
 */
const PROGRAM_PREFIX_TO_COUNTRY: Array<[string, string, string]> = [
  // [prefix, ISO-2 code, display name]
  ["IRAN", "IR", "Iran"],
  ["RUSSIA", "RU", "Russia"],
  ["UKRAINE-EO", "RU", "Russia"], // Ukraine-related EOs sanction Russian actors
  ["DPRK", "KP", "North Korea"],
  ["NKEA", "KP", "North Korea"],
  ["SYRIA", "SY", "Syria"],
  ["CUBA", "CU", "Cuba"],
  ["VENEZUELA", "VE", "Venezuela"],
  ["BELARUS", "BY", "Belarus"],
  ["MYANMAR", "MM", "Myanmar"],
  ["BURMA", "MM", "Myanmar"],
  ["ZIMBABWE", "ZW", "Zimbabwe"],
  ["SUDAN", "SD", "Sudan"],
  ["DARFUR", "SD", "Sudan"],
  ["LEBANON", "LB", "Lebanon"],
  ["HIZBALLAH", "LB", "Lebanon"],
  ["SOMALIA", "SO", "Somalia"],
  ["BALKANS", "RS", "Western Balkans"],
];

export interface OfacJurisdictionEntry {
  country: string;
  programs: string[]; // distinct program tokens active for this jurisdiction
  entryCount: number; // SDN entries whose program list hits one of the above
}

export interface OfacSdnFeed {
  jurisdictions: Record<string, OfacJurisdictionEntry>;
  totalEntries: number;
  fetchedAt: string;
  source: string;
}

/**
 * OFAC publishes the canonical SDN file at this URL. Treasury migrated
 * the export from `www.treasury.gov/ofac/downloads/sdn.csv` to the
 * `sanctionslistservice.ofac.treas.gov` host; the legacy URL still 302s
 * to here, but we point directly at the new host to save the redirect
 * round-trip. Format also flipped from pipe-delimited to comma-delimited
 * during the move — the parser auto-detects the delimiter on the first
 * row so we keep working if Treasury flips back.
 */
export const OFAC_SDN_URL =
  "https://sanctionslistservice.ofac.treas.gov/api/publicationpreview/exports/sdn.csv";

/** Resolve an OFAC program token to a country code. Returns null when the
 *  program isn't bound to a single jurisdiction (cyber, SDGT, NPWMD, etc.). */
export function programToCountry(program: string): { code: string; country: string } | null {
  const upper = program.trim().toUpperCase();
  for (const [prefix, code, country] of PROGRAM_PREFIX_TO_COUNTRY) {
    if (upper.startsWith(prefix)) return { code, country };
  }
  return null;
}

/**
 * Parse OFAC SDN.csv text into a per-jurisdiction summary.
 *
 * Columns (unchanged across format revisions):
 *   ent_num , SDN_Name , SDN_Type , Program , Title , Call_Sign ,
 *   Vess_type , Tonnage , GRT , Vess_flag , Vess_owner , Remarks
 *
 * The Program field is itself semicolon-separated (e.g. "IRAN; IRAN-EO13599").
 *
 * Historically Treasury served this as a pipe-delimited file (despite the
 * .csv extension) but they switched to comma-delimited with quoted strings
 * at some point — likely when the file moved from `treasury.gov` to
 * `sanctionslistservice.ofac.treas.gov`. The parser now auto-detects the
 * delimiter on the first non-empty row: if it contains a `|`, the file is
 * pipe-delimited; otherwise comma-delimited. This way we keep working if
 * Treasury flips back without code changes.
 *
 * Empty fields in the comma-delimited file are encoded as `-0-` (a SDN
 * convention) rather than an empty token. We treat both `-0-` and `""` as
 * empty when extracting the Program column.
 */
export function parseOfacSdnCsv(csv: string): OfacSdnFeed {
  const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
  const jurisdictions: Record<string, OfacJurisdictionEntry> = {};
  let totalEntries = 0;

  // Auto-detect delimiter on the first non-empty line. Pipe wins if present
  // (the historic format); fall back to comma (the new format).
  const delimiter = lines.length > 0 && lines[0].includes("|") ? "|" : ",";

  for (const line of lines) {
    const fields = splitDelimitedRow(line, delimiter);
    if (fields.length < 4) continue;
    const rawProgramField = fields[3]?.trim() ?? "";
    // `-0-` is the SDN convention for "empty" in the comma-delimited
    // export; treat it the same as a literal empty string so we don't
    // count empty-program rows.
    if (rawProgramField === "" || rawProgramField === "-0-") continue;
    const programs = rawProgramField
      .split(/[;,]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s !== "-0-");
    if (programs.length === 0) continue;
    totalEntries += 1;

    // Record every distinct program token in the jurisdiction's programs[],
    // but only bump entryCount once per (entry, jurisdiction) pair.
    const countedCodes = new Set<string>();
    for (const p of programs) {
      const match = programToCountry(p);
      if (!match) continue;
      const entry =
        jurisdictions[match.code] ?? {
          country: match.country,
          programs: [],
          entryCount: 0,
        };
      if (!entry.programs.includes(p)) entry.programs.push(p);
      if (!countedCodes.has(match.code)) {
        entry.entryCount += 1;
        countedCodes.add(match.code);
      }
      jurisdictions[match.code] = entry;
    }
  }

  return {
    jurisdictions,
    totalEntries,
    fetchedAt: new Date().toISOString(),
    source: "OFAC SDN",
  };
}

/**
 * Split a delimited line honouring `"..."` quoted fields. Used for both
 * the historic pipe-delimited and the current comma-delimited OFAC SDN
 * exports — `parseOfacSdnCsv` picks the delimiter based on what the
 * upstream file actually contains. Quote-handling logic is identical
 * across delimiters; only the field separator changes.
 */
function splitDelimitedRow(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Deterministic mock feed for dev environments where Treasury is unreachable
 * or OFAC_SOURCE_OVERRIDE is unset. Tagged "(mock)" so it can never be
 * confused with real data downstream.
 */
export function mockOfacSdnFeed(): OfacSdnFeed {
  return {
    jurisdictions: {
      IR: {
        country: "Iran",
        programs: ["IRAN", "IRAN-EO13599", "IRAN-EO13902", "IRAN-HR"],
        entryCount: 1843,
      },
      RU: {
        country: "Russia",
        programs: ["RUSSIA-EO14024", "UKRAINE-EO13662", "UKRAINE-EO13685"],
        entryCount: 2917,
      },
      KP: {
        country: "North Korea",
        programs: ["DPRK", "DPRK2", "NKEA"],
        entryCount: 412,
      },
      SY: {
        country: "Syria",
        programs: ["SYRIA"],
        entryCount: 318,
      },
      CU: {
        country: "Cuba",
        programs: ["CUBA"],
        entryCount: 287,
      },
      VE: {
        country: "Venezuela",
        programs: ["VENEZUELA-EO13692", "VENEZUELA-EO13884"],
        entryCount: 198,
      },
      BY: {
        country: "Belarus",
        programs: ["BELARUS-EO14038", "BELARUS"],
        entryCount: 124,
      },
    },
    totalEntries: 6099,
    fetchedAt: new Date().toISOString(),
    source: "OFAC SDN (mock — upstream unreachable)",
  };
}

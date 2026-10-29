// filters.js
// Keeps jobs in eligible countries (config/countries.json), and removes jobs
// already in the Google Sheet. With open_to_candidate_only on, jobs that only
// hire in named countries or regions you don't live in are dropped too;
// with it off they are kept and flagged in the Notes.

import { loadJson } from "./loadJson.js";

const countriesConfig = loadJson(import.meta.url, "../config/countries.json");

const ELIGIBLE_COUNTRIES = new Set(
  (countriesConfig.eligible_countries || []).map((c) => c.toLowerCase()),
);

const REMOTE_SIGNALS = [
  "remote",
  "worldwide",
  "anywhere",
  "global",
  "distributed",
];

// Phrases in a description that make clear the job is remote.
const REMOTE_TEXT =
  /\b(fully remote|100% remote|remote[- ]first|remote[- ]friendly|work from anywhere|work remotely|remote position|remote role|this is a remote)\b/i;

// These boards only list remote jobs, so every job from them is remote even
// when its location text is just a country name.
const REMOTE_ONLY_SOURCES = [
  "remotive",
  "weworkremotely",
  "himalayas",
  "remoteok",
];

// Set REQUIRE_REMOTE=true in .env.local to drop jobs that don't look remote
// (on-site office jobs from company career pages). Off by default.
const REQUIRE_REMOTE = process.env.REQUIRE_REMOTE === "true";

// Abbreviations real postings use, mapped to the names in countries.json.
const SYNONYMS = {
  uk: "united kingdom",
  "u.k.": "united kingdom",
  britain: "united kingdom",
  us: "united states",
  "u.s.": "united states",
  usa: "united states",
  "u.s.a.": "united states",
  uae: "united arab emirates",
  "u.a.e.": "united arab emirates",
  dubai: "united arab emirates",
  "abu dhabi": "united arab emirates",
  holland: "netherlands",
  korea: "south korea",
};

function extractNamedCountry(location) {
  const loc = location.toLowerCase();
  for (const [alias, canonical] of Object.entries(SYNONYMS)) {
    const re = new RegExp(`(^|[^a-z])${alias.replace(/\./g, "\\.")}($|[^a-z])`);
    if (re.test(loc) && ELIGIBLE_COUNTRIES.has(canonical)) return canonical;
  }
  for (const country of ELIGIBLE_COUNTRIES) {
    if (loc.includes(country)) return country;
  }
  return null;
}

function looksRemoteWorldwide(location) {
  const loc = location.toLowerCase();
  if (REMOTE_SIGNALS.some((signal) => loc.includes(signal))) {
    // "Remote - Germany" still names a country, treat as that country instead
    return !extractNamedCountry(loc);
  }
  return false;
}

const CANDIDATE_COUNTRY = (countriesConfig.candidate_country || "").toLowerCase();
const OPEN_TO_CANDIDATE_ONLY = countriesConfig.open_to_candidate_only === true;

function namesCandidateCountry(text) {
  return (
    CANDIDATE_COUNTRY !== "" &&
    new RegExp(`(^|[^a-z])${CANDIDATE_COUNTRY}($|[^a-z])`).test(text.toLowerCase())
  );
}

export function isLocationEligible(location) {
  // "Remote - Nigeria" is open to you even though Nigeria is below the pay
  // floor: the floor is about local-currency office jobs.
  if (namesCandidateCountry(location || "") && REMOTE_SIGNALS.some((s) => location.toLowerCase().includes(s))) {
    return { ok: true, reason: "Remote and open in your country" };
  }
  if (!location || location.trim() === "") {
    return {
      ok: true,
      reason: "No location specified, treated as open/remote",
    };
  }
  const namedCountry = extractNamedCountry(location);
  if (namedCountry) {
    return {
      ok: true,
      reason: `Named country '${namedCountry}' is on the eligible list`,
    };
  }
  if (looksRemoteWorldwide(location)) {
    return {
      ok: true,
      reason: "Remote/worldwide, no single country pay scale applies",
    };
  }
  return {
    ok: false,
    reason: `Location '${location}' does not match an eligible country and isn't remote/worldwide`,
  };
}

// True if the job is clearly remote: it came from a remote-only board, the
// location or title says so, or the description says so.
export function isRemoteJob(job) {
  if (REMOTE_ONLY_SOURCES.includes(job.source)) return true;
  const loc = (job.location || "").toLowerCase();
  const title = (job.title || "").toLowerCase();
  if (REMOTE_SIGNALS.some((s) => loc.includes(s) || title.includes(s)))
    return true;
  return REMOTE_TEXT.test((job.description || "").slice(0, 4000));
}

// Locations that mean "open to people in Africa / anywhere".
const OPEN_SIGNALS = ["worldwide", "global", "anywhere", "emea", "africa"];
// Regions that exclude Nigeria.
const CLOSED_REGIONS = [
  "amer",
  "americas",
  "north america",
  "latam",
  "latin america",
  "apac",
  "asia",
  "europe",
  "eu",
];

// True when a job is tied to specific countries or regions (e.g. "Remote -
// USA", "Remote, AMER").
export function isLocationRestricted(location) {
  const loc = (location || "").toLowerCase();
  if (!loc || OPEN_SIGNALS.some((s) => loc.includes(s))) return false;
  if (namesCandidateCountry(loc)) return false;
  if (extractNamedCountry(loc)) return true;
  // "Remote - India", "Remote, Brazil": any place named after "Remote".
  if (/\bremote\s*[-–,:@]\s*[a-z]/.test(loc)) return true;
  return CLOSED_REGIONS.some((r) =>
    new RegExp(`(^|[^a-z])${r}($|[^a-z])`).test(loc),
  );
}

// Hiring limits that only show up in the title or description, e.g.
// "(Remote @ Colombia)", "Fully Remote (US)", "we can hire candidates based
// in the UK, Ireland...", "ONLY residents of countries with US time zones".
const PLACE = "(the )?(us|u\\.s\\.|usa|united states|canada|uk|united kingdom|europe|eu|latam|latin america|north america|americas|[a-z]+ time ?zones?)";
const TEXT_RESTRICTIONS = [
  /\bremote\s*@\s*[a-z]/i,
  new RegExp(`\\b(fully )?remote\\s*\\(\\s*${PLACE}\\s*\\)`, "i"),
  new RegExp(`\\bheadquarters:\\s*remote\\s*[-,]\\s*${PLACE}\\b`, "i"),
  /\bcan (only )?hire (candidates |people )?(who are )?(based|located|living) in\b/i,
  /\bonly (open to )?(residents|candidates|applicants) (of|in|based in|located in)\b/i,
  new RegExp(`\\b(must|need to|required to) (be )?(based|located|reside|living) in ${PLACE}\\b`, "i"),
  new RegExp(`\\bauthori[sz]ed to work in ${PLACE}\\b`, "i"),
  /\bus time ?zones?\b/i,
];

// True when the title or description limits hiring to places you don't
// live in. A mention of your country, Africa, EMEA or worldwide cancels it.
export function hasTextRestriction(job) {
  const text = `${job.title || ""}\n${(job.description || "").slice(0, 12000)}`;
  if (!TEXT_RESTRICTIONS.some((re) => re.test(text))) return false;
  if (namesCandidateCountry(text)) return false;
  return !/\b(africa|emea|worldwide|anywhere in the world)\b/i.test(text);
}

export function filterJobs(jobs) {
  const passed = [];
  for (const job of jobs) {
    if (REQUIRE_REMOTE && !isRemoteJob(job)) continue;
    const { ok, reason } = isLocationEligible(job.location || "");
    if (!ok) continue;
    const locationRestricted =
      isLocationRestricted(job.location || "") || hasTextRestriction(job);
    if (OPEN_TO_CANDIDATE_ONLY && locationRestricted) continue;
    passed.push({ ...job, eligibilityReason: reason, locationRestricted });
  }
  return passed;
}

// Removes jobs with no link, jobs already in the sheet, and duplicates
// within this batch. existingLinks is a Set from getExistingLinks().
export function deduplicate(jobs, existingLinks) {
  const seen = new Set(existingLinks);
  return jobs.filter((j) => {
    if (!j.link || seen.has(j.link)) return false;
    seen.add(j.link);
    return true;
  });
}

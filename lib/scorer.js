// scorer.js
// Decides which of the 3 resumes fits a job and computes a 0-100 match score.
// A lightweight first-pass filter, not a human read of the posting.
// Always read the real posting before applying.

import { loadJson } from "./loadJson.js";

const cvMapping = loadJson(import.meta.url, "../config/cvMapping.json");

const CV_CATEGORIES = Object.fromEntries(
  Object.entries(cvMapping).filter(
    ([k]) => !k.startsWith("_") && k !== "notes",
  ),
);

const DEFAULT_CV_KEY =
  Object.entries(CV_CATEGORIES).find(([, v]) => v.isDefault)?.[0] ||
  Object.keys(CV_CATEGORIES)[0];

// Seniority is judged from the TITLE only.
const SENIOR_SOFT = ["senior", "sr"];
const SENIOR_HARD = [
  "staff",
  "principal",
  "lead",
  "director",
  "head of",
  "vp",
  "manager",
  "architect",
];
const JUNIOR_WORDS = [
  "junior",
  "jr",
  "intern",
  "internship",
  "entry level",
  "entry-level",
  "graduate",
  "trainee",
];

// A role must look like a dev role by title.
const ROLE_WORDS = [
  "engineer",
  "developer",
  "programmer",
  "software",
  "frontend",
  "front-end",
  "front end",
  "full stack",
  "full-stack",
  "fullstack",
  "web",
  "mobile",
  "react",
  "ios",
  "android",
];

// Titles that say "engineer" but are not developer jobs.
const NON_DEV_TITLE = [
  "support",
  "sales",
  "customer",
  "success",
  "account",
  "recruiter",
  "talent",
  "marketing",
  "designer",
  "attorney",
  "counsel",
  "legal",
  "finance",
  "accountant",
  "analyst",
  "operations",
  "people",
  "writer",
  "content",
  "community",
  "solutions",
  "researcher",
  "scientist",
  "technician",
  "developer relations",
  "advocate",
  "evangelist",
  "consultant",
  "administrator",
  "specialist",
  "coordinator",
  "associate",
  "representative",
  "trainer",
  "services",
  "curriculum",
  "enablement",
  "instructional",
];

// Languages and platforms you don't work in. A posting that REQUIRES one
// ("4+ years of Go", "Go and TypeScript required", "strong skills in
// Java") is penalised even when the title looks right.
const UNFAMILIAR_STACK = [
  "go",
  "golang",
  "java",
  "rust",
  "ruby",
  "rails",
  "php",
  "laravel",
  "wordpress",
  "c\\+\\+",
  "c#",
  "\\.net",
  "scala",
  "elixir",
  "kotlin",
  "swift",
  "solidity",
  "django",
  "angular",
  "vue",
];
const STACK = `(${UNFAMILIAR_STACK.join("|")})`;
// "one or more of", "such as", "e.g." mean the language is one option.
const CHOICE = /one or more|such as|any of|e\.g\.|like |either/i;
const REQUIRED_STACK = [
  new RegExp(`\\b\\d{1,2}\\s*\\+?\\s*(years?|yrs)([^.\\n]{0,60}?)\\b${STACK}\\b`, "gi"),
  new RegExp(`\\b${STACK}\\b[^.\\n]{0,30}\\brequired\\b`, "gi"),
  new RegExp(`\\b(strong|expert|deep|solid|advanced|high level of)\\b([^.\\n]{0,25}?)\\b${STACK}\\b`, "gi"),
];

function requiresUnfamiliarStack(blob) {
  for (const re of REQUIRED_STACK) {
    for (const m of blob.matchAll(re)) {
      if (!CHOICE.test(m[0])) return true;
    }
  }
  // Or the posting is mostly about one of them (WordPress/PHP theme work).
  const mentions = (term) =>
    (blob.match(new RegExp(`(^|[^a-z0-9])${term}($|[^a-z0-9])`, "g")) || []).length;
  const fit = ["typescript", "node.js", "nodejs", "react"].reduce((n, t) => n + mentions(t.replace(".", "\\.")), 0);
  return UNFAMILIAR_STACK.some((t) => {
    const n = mentions(t);
    return n >= 3 && n > fit;
  });
}

// The most years any line of the posting asks for (capped at 15).
function maxYearsAsked(blob) {
  let max = 0;
  for (const m of blob.matchAll(/\b(\d{1,2})\s*\+?\s*(?:-|to)?\s*\d{0,2}\s*\+?\s*(?:years|yrs)\b/g)) {
    const n = Number(m[1]);
    if (n <= 15 && n > max) max = n;
  }
  return max;
}

// Stacks and specialities that are not a fit for the CVs.
const WRONG_STACK_TITLE = [
  "game",
  ".net",
  "dotnet",
  "c#",
  "c++",
  "angular",
  "vue",
  "vue.js",
  "php",
  "ruby",
  "rails",
  "django",
  "java",
  "golang",
  "go",
  "rust",
  "scala",
  "elixir",
  "flutter",
  "ios",
  "android",
  "swift",
  "kotlin",
  "salesforce",
  "shopify",
  "wordpress",
  "sap",
  "servicenow",
  "devops",
  "sre",
  "reliability",
  "security",
  "machine learning",
  "ml",
  "data",
  "embedded",
  "firmware",
  "qa",
  "test",
  "sdet",
  "database",
  "dba",
  "network",
  "kubernetes",
  "infrastructure",
  "cloud",
  "deployment",
  "blockchain",
  "platform",
];

// A title containing one of these is a fit for the CVs, so a wrong-stack
// word next to it ("React + .NET") is not penalised. Backend and full-stack
// titles are not penalised either: you are full-stack with a backend lean.
const FIT_STACK_TITLE = [
  "react",
  "typescript",
  "javascript",
  "node",
  "node.js",
  "nodejs",
  "next.js",
  "nextjs",
  "bun",
  "frontend",
  "front-end",
  "front end",
];

// At least one of these must appear somewhere, or the job isn't a fit.
const CORE_SKILLS = [
  "react",
  "reactjs",
  "next.js",
  "nextjs",
  "typescript",
  "javascript",
  "tailwind",
  "node.js",
  "nodejs",
];

const KNOWN_SKILLS = [
  ...CORE_SKILLS,
  "express",
  "express.js",
  "mongodb",
  "postgresql",
  "postgres",
  "postgis",
  "supabase",
  "redis",
  "prisma",
  "drizzle",
  "docker",
  "websockets",
  "server-sent events",
  "rest api",
  "graphql",
  "redux",
  "vite",
  "python",
  "fastapi",
  "flask",
  "bun",
  "paystack",
  "stripe",
  "flutterwave",
  "payments",
  "k6",
  "load testing",
  "github actions",
  "ci/cd",
  "git",
  "agile",
  "scrum",
];

// Whole-word matching: "expo" must not match "exposure".
const regexCache = new Map();
function hasTerm(text, term) {
  let re = regexCache.get(term);
  if (!re) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
    re = new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`);
    regexCache.set(term, re);
  }
  return re.test(text);
}

function textBlob(job) {
  return `${job.title || ""} ${job.description || ""}`.toLowerCase();
}

export function pickCvVersion(job) {
  const blob = textBlob(job);
  const title = (job.title || "").toLowerCase();

  // Pass 1: title keywords. If the title names a role type, trust it.
  let pass1Key = null;
  for (const [key, rules] of Object.entries(CV_CATEGORIES)) {
    if ((rules.titleKeywords || []).some((kw) => hasTerm(title, kw))) {
      pass1Key = key;
      break;
    }
  }

  // Pass 2: skill keyword overlap across the whole posting.
  const scores = {};
  for (const [key, rules] of Object.entries(CV_CATEGORIES)) {
    scores[key] = (rules.skillKeywords || []).filter((kw) =>
      hasTerm(blob, kw),
    ).length;
  }
  const maxScore = Math.max(...Object.values(scores));
  const topKeys =
    maxScore > 0
      ? Object.keys(scores).filter((k) => scores[k] === maxScore)
      : [];
  const pass2Key = topKeys.length
    ? topKeys.includes(DEFAULT_CV_KEY)
      ? DEFAULT_CV_KEY
      : topKeys[0]
    : null;

  const finalKey = pass1Key || pass2Key || DEFAULT_CV_KEY;

  // Flag for a human only when the title gave no clue AND two different CVs
  // tie for the best skill match. A clear title is never flagged.
  const needsReview = !pass1Key && topKeys.length > 1;

  return {
    cvKey: finalKey,
    resumeFile: CV_CATEGORIES[finalKey].resumeFile,
    needsReview,
  };
}

export function computeMatchScore(job) {
  const blob = textBlob(job);
  const title = (job.title || "").toLowerCase();
  let score = 15; // base

  // Skills overlap (up to 40)
  const skillHits = KNOWN_SKILLS.filter((kw) => hasTerm(blob, kw)).length;
  score += Math.min(skillHits * 6, 40);

  // Seniority, from the title only
  if (SENIOR_HARD.some((w) => hasTerm(title, w))) {
    score -= 25;
  } else if (SENIOR_SOFT.some((w) => hasTerm(title, w))) {
    score += 15;
  } else if (JUNIOR_WORDS.some((w) => hasTerm(title, w))) {
    score -= 10;
  } else {
    score += 25;
  }

  // You have 3+ years: 5-6 is a stretch, 7+ is probably too senior
  const yearsAsked = maxYearsAsked(blob);
  if (yearsAsked >= 7) score -= 20;
  else if (yearsAsked >= 5) score -= 10;

  const needsUnfamiliarStack = requiresUnfamiliarStack(blob);

  if ((job.description || "").length > 200) score += 10;
  if (job.employmentType) score += 10;

  // Title relevance
  const titleFitsStack = FIT_STACK_TITLE.some((w) => hasTerm(title, w));
  if (titleFitsStack) score += 10;
  if (!ROLE_WORDS.some((w) => hasTerm(title, w))) score -= 40;
  if (NON_DEV_TITLE.some((w) => hasTerm(title, w))) score -= 60;
  if (!titleFitsStack && WRONG_STACK_TITLE.some((w) => hasTerm(title, w))) {
    score -= 40;
  }
  // "React" fits, "React Native" (mobile) does not
  if (hasTerm(title, "react native")) score -= 40;
  // A required language you don't use: never a match, however well the rest fits
  if (needsUnfamiliarStack) score = Math.min(score, 45);
  // No core web skill anywhere: can't pass on bonuses alone
  const coreHits = CORE_SKILLS.filter((kw) => hasTerm(blob, kw)).length;
  if (coreHits === 0) score = Math.min(score, 45);

  return Math.max(0, Math.min(100, score));
}

export function scoreAndTag(job) {
  const { cvKey, resumeFile, needsReview } = pickCvVersion(job);
  return {
    ...job,
    cvVersion: cvKey,
    resumeFile,
    matchScore: computeMatchScore(job),
    needsManualReview: needsReview,
  };
}

// Scores every job, keeps those at or above minimumScore, best first, and
// allows at most maxPerCompany per company so one employer can't fill the
// whole list. Jobs left out come back in later runs, since only jobs
// already in the sheet are skipped.
export function scoreAll(jobs, minimumScore = 55, maxPerCompany = 3) {
  const scored = jobs
    .map(scoreAndTag)
    .filter((j) => j.matchScore >= minimumScore)
    .sort((a, b) => b.matchScore - a.matchScore);

  const perCompany = new Map();
  return scored.filter((j) => {
    const key = (j.company || "unknown").toLowerCase();
    const count = perCompany.get(key) || 0;
    if (count >= maxPerCompany) return false;
    perCompany.set(key, count + 1);
    return true;
  });
}

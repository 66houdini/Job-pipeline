import { test } from "node:test";
import assert from "node:assert/strict";
import { computeMatchScore, pickCvVersion, scoreAll } from "../lib/scorer.js";

const skills =
  "We build with React, TypeScript, Next.js and Tailwind on a web application. ".repeat(
    4,
  );
const job = (title, extra = {}) => ({
  title,
  description: skills,
  employmentType: "FullTime",
  ...extra,
});
const MINIMUM = 55;

test("the roles you are targeting pass the minimum score", () => {
  for (const title of [
    "Frontend Engineer",
    "Senior React Full-stack Developer",
    "Product Engineer",
    "Software Engineer",
    "Backend Developer",
    "Senior back-end Engineer",
    "Node.js Engineer",
    "Full Stack Engineer",
  ]) {
    assert.ok(computeMatchScore(job(title)) >= MINIMUM, title);
  }
});

test("jobs that are not a fit fall below the minimum score", () => {
  for (const title of [
    "Support Engineer (EMEA)",
    "Developer Relations Engineer",
    "Backend Engineer (Go)",
    "Senior Java Backend Developer",
    "Flutter Developer",
    "Senior .NET Full-stack Developer",
    "Senior Angular Full-stack Developer",
    "Senior Shopify Developer",
    "Salesforce Engineer III",
    "Postgres Deployment Engineer",
    "Staff Frontend Engineer",
  ]) {
    assert.ok(computeMatchScore(job(title)) < MINIMUM, title);
  }
});

test("a posting that requires a language you don't use falls below the minimum", () => {
  for (const extra of [
    "(Required) Have 4+ years of professional experience writing and shipping Go in production.",
    "Have strong software engineering skills (Go and Typescript required).",
    "Strong coding skills in Java, with a working understanding of microservices.",
    "Experience as Fullstack Web3 developer. Web3: High level of Solidity (demonstrated experience).",
    "Build custom WordPress themes. Strong WordPress and PHP skills. WordPress block themes. PHP templates. WordPress plugins.",
  ]) {
    const j = job("Full Stack Developer", { description: skills + extra });
    assert.ok(computeMatchScore(j) < MINIMUM, extra);
  }
});

test("a language listed as one option among several is not penalised", () => {
  const j = job("Software Engineer", {
    description:
      skills +
      "Proficiency in languages such as Go, TypeScript, Python, Rust, or Ruby. " +
      "3+ years of experience in one or more general-purpose programming languages; Go, Python, Rust, Ruby.",
  });
  assert.ok(computeMatchScore(j) >= 80);
});

test("asking for more years than you have lowers the score", () => {
  const score = (years) =>
    computeMatchScore(
      job("Full Stack Engineer", {
        description: skills + `${years}+ years of software engineering experience.`,
      }),
    );
  assert.ok(score(3) > score(5));
  assert.ok(score(5) > score(7));
});

test("non-engineering and mobile roles fall below the minimum", () => {
  for (const title of [
    "Sr REACT NATIVE",
    "Technical Curriculum Developer, Technical Enablement",
    "Technical Services Engineer",
  ]) {
    assert.ok(computeMatchScore(job(title)) < MINIMUM, title);
  }
});

test("a full-stack role that mentions backend is not rejected", () => {
  assert.ok(
    computeMatchScore(job("Senior Full Stack Engineer (Backend heavy)")) >=
      MINIMUM,
  );
});

test("the title decides which CV is used", () => {
  assert.equal(
    pickCvVersion(job("Backend Developer")).cvKey,
    "backend_engineer",
  );
  assert.equal(
    pickCvVersion(job("Full Stack Developer")).cvKey,
    "fullstack_engineer",
  );
  assert.equal(
    pickCvVersion(job("Frontend Engineer")).cvKey,
    "frontend_engineer",
  );
});

test("a clear title is never flagged for manual CV review", () => {
  assert.equal(
    pickCvVersion(job("Senior React Full-stack Developer")).needsReview,
    false,
  );
});

test("words must match whole: 'Google' is not 'go'", () => {
  assert.ok(computeMatchScore(job("Software Engineer at Google")) >= MINIMUM);
});

test("jobs with none of your core skills cannot pass on bonuses alone", () => {
  const j = job("Software Engineer", {
    description: "We build things in COBOL. ".repeat(20),
  });
  assert.ok(computeMatchScore(j) < MINIMUM);
});

test("one company cannot fill the list: at most 3 per company", () => {
  const many = Array.from({ length: 8 }, (_, i) =>
    job("Frontend Engineer", { company: "supabase", link: "l" + i }),
  );
  assert.equal(scoreAll(many, MINIMUM).length, 3);
});

test("results come back best match first", () => {
  const list = [
    job("Software Engineer", { company: "a" }),
    job("Frontend Engineer", { company: "b" }),
  ];
  const scores = scoreAll(list, MINIMUM).map((j) => j.matchScore);
  assert.deepEqual(
    scores,
    [...scores].sort((x, y) => y - x),
  );
});

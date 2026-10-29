import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isLocationEligible,
  isLocationRestricted,
  isRemoteJob,
  filterJobs,
  deduplicate,
} from "../lib/filters.js";

test("countries on your list are accepted, abbreviations included", () => {
  for (const place of [
    "Berlin, Germany",
    "Dubai, UAE",
    "UK",
    "Remote - USA",
    "Singapore",
  ]) {
    assert.equal(isLocationEligible(place).ok, true, place);
  }
});

test("countries below your pay floor are rejected", () => {
  for (const place of [
    "Lagos, Nigeria",
    "Mumbai, India",
    "Manila, Philippines",
  ]) {
    assert.equal(isLocationEligible(place).ok, false, place);
  }
});

test("remote and worldwide jobs are accepted, and so is a blank location", () => {
  for (const place of ["Remote", "Worldwide", "Remote, EMEA", "Anywhere", ""]) {
    assert.equal(isLocationEligible(place).ok, true, place || "(blank)");
  }
});

test("jobs tied to specific countries or regions are flagged, open ones are not", () => {
  for (const place of [
    "Remote - USA",
    "Remote, AMER",
    "Remote - Canada",
    "Remote - UK",
  ]) {
    assert.equal(isLocationRestricted(place), true, place);
  }
  for (const place of [
    "Remote",
    "Remote, EMEA",
    "Remote, Global",
    "Worldwide",
  ]) {
    assert.equal(isLocationRestricted(place), false, place);
  }
});

test("remote-only boards are always remote, even with just a country name", () => {
  assert.equal(
    isRemoteJob({
      source: "himalayas",
      location: "United States",
      title: "Dev",
    }),
    true,
  );
  assert.equal(
    isRemoteJob({
      source: "greenhouse",
      location: "Berlin, Germany",
      title: "Dev",
      description: "",
    }),
    false,
  );
  assert.equal(
    isRemoteJob({
      source: "greenhouse",
      location: "",
      title: "Dev",
      description: "This is a fully remote role.",
    }),
    true,
  );
});

test("filterJobs keeps only jobs open to someone in Nigeria", () => {
  const out = filterJobs([
    { source: "ashby", title: "Dev", location: "Remote - USA" },
    { source: "ashby", title: "Dev", location: "Lagos, Nigeria" },
    { source: "ashby", title: "Dev", location: "Remote, EMEA" },
    { source: "ashby", title: "Dev", location: "Remote - Nigeria" },
    { source: "ashby", title: "Dev", location: "Remote, Europe" },
    { source: "ashby", title: "Dev", location: "Europe, USA, Canada, APAC" },
    { source: "ashby", title: "Dev", location: "Mexico City" },
    { source: "ashby", title: "Dev", location: "Remote - India" },
  ]);
  assert.deepEqual(
    out.map((j) => j.location),
    ["Remote, EMEA", "Remote - Nigeria"],
  );
  assert.ok(out.every((j) => j.locationRestricted === false));
});

test("hiring limits written in the title or description are caught", () => {
  const job = (title, description) => ({
    source: "weworkremotely",
    title,
    location: "Remote",
    description,
  });
  for (const j of [
    job("Software Development Engineer II (Remote @ Colombia)", ""),
    job("Front-End Developer", "Location: Fully Remote (US)"),
    job("Full Stack Developer", "For this role, we can hire candidates based in the UK, Ireland, Germany"),
    job("Fullstack Engineer", "100% Remote but ONLY residents of countries with US time zones (EST-PST)"),
    job("Frontend Engineer, Ads", "Headquarters: Remote - United States"),
    job("Backend Engineer", "Candidates must be based in the US."),
  ]) {
    assert.equal(filterJobs([j]).length, 0, j.title);
  }
});

test("a description that also opens the job to Africa or worldwide is kept", () => {
  const out = filterJobs([
    {
      source: "remotive",
      title: "Backend Engineer",
      location: "Remote",
      description: "Must be authorized to work in the US or based anywhere in Africa.",
    },
    {
      source: "remotive",
      title: "AI Coding Tasks",
      location: "Worldwide",
      description: "Remote, any location.",
    },
  ]);
  assert.equal(out.length, 2);
});

test("deduplicate removes known links, repeats and jobs with no link", () => {
  const out = deduplicate(
    [{ link: "a" }, { link: "b" }, { link: "b" }, { link: "" }, { link: "c" }],
    new Set(["a"]),
  );
  assert.deepEqual(
    out.map((j) => j.link),
    ["b", "c"],
  );
});

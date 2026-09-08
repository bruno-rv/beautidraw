import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import {
  FAMILY_CAPACITIES,
  collectFamilyCapacityFailures,
  preflightDeck,
} from "../scripts/preflight.mjs";

const root = resolve(import.meta.dirname, "..");

function specFor(band) {
  return {
    title: "Capacity fixture",
    subtitle: "A bounded capacity fixture",
    footer: "Split oversized visuals across frames.",
    bands: [{
      heading: "Capacity frame",
      deck: "The renderer has a finite authored capacity.",
      accent: "blue",
      ...band,
    }],
  };
}

function node(index) {
  return { label: `Node ${index + 1}`, note: "A bounded authored node" };
}

function callout(index) {
  return { kind: "example", label: `Callout ${index + 1}`, note: "A bounded authored callout" };
}

test("every composition family rejects authored nodes beyond its consumed capacity", () => {
  for (const [family, capacity] of Object.entries(FAMILY_CAPACITIES)) {
    const spec = specFor({
      pattern: "canvas",
      height: 700,
      visual: { family, nodes: Array.from({ length: capacity.nodes + 1 }, (_, index) => node(index)) },
    });
    const failures = collectFamilyCapacityFailures(spec);
    assert.ok(
      failures.some(({ field, reason }) => field === "bands[0].visual.nodes" && reason.includes(`supports up to ${capacity.nodes}`)),
      `${family} must reject node ${capacity.nodes + 1}`,
    );
  }
});

test("illustration and spotlight reject authored callouts beyond their visible slots", () => {
  for (const family of ["illustration", "spotlight"]) {
    const capacity = FAMILY_CAPACITIES[family].callouts;
    const spec = specFor({
      pattern: "canvas",
      height: 700,
      visual: { family, callouts: Array.from({ length: capacity + 1 }, (_, index) => callout(index)) },
    });
    const failures = collectFamilyCapacityFailures(spec);
    assert.ok(
      failures.some(({ field, reason }) => field === "bands[0].visual.callouts" && reason.includes(`supports up to ${capacity}`)),
      `${family} must reject callout ${capacity + 1}`,
    );
  }
});

test("generic composition families accept two callouts and reject a third before browser work", async (t) => {
  const genericFamilies = Object.entries(FAMILY_CAPACITIES)
    .filter(([family, capacity]) => !["illustration", "spotlight"].includes(family) && capacity.callouts === 2)
    .map(([family]) => family);
  const temp = await mkdtemp(join(tmpdir(), "beautidraw-generic-callout-capacity-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  for (const family of genericFamilies) {
    const accepted = specFor({
      pattern: "canvas",
      height: 700,
      visual: { family, callouts: [callout(0), callout(1)] },
    });
    assert.equal((await preflightDeck({ spec: accepted })).ok, true, `${family} must accept two callouts`);

    const rejected = specFor({
      pattern: "canvas",
      height: 700,
      visual: { family, callouts: [callout(0), callout(1), callout(2)] },
    });
    const preflight = await preflightDeck({ spec: rejected });
    assert.equal(preflight.ok, false, `${family} must reject three callouts`);
    assert.match(preflight.failures.map(({ reason }) => reason).join("\n"), new RegExp(`${family} family supports up to 2 authored callouts`));
    const specPath = join(temp, `${family}.json`);
    const outDir = join(temp, `${family}-out`);
    await writeFile(specPath, JSON.stringify(rejected));
    const result = spawnSync(process.execPath, [resolve(root, "scripts/build-deck.mjs"), specPath, outDir], {
      cwd: root,
      encoding: "utf8",
      timeout: 120_000,
    });
    assert.notEqual(result.status, 0, `${family} must fail before browser work`);
    assert.match(`${result.stdout}${result.stderr}`, new RegExp(`${family} family supports up to 2 authored callouts`));
    assert.equal(existsSync(join(outDir, "deck.excalidraw")), false, `${family} must not publish a partial deck`);
  }
});

test("preflight and public build reject seventh map node and fifth spotlight callout before browser work", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "beautidraw-family-capacity-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const cases = [
    {
      name: "map-seventh-node",
      band: { pattern: "canvas", height: 700, visual: { family: "map", nodes: Array.from({ length: 7 }, (_, index) => node(index)) } },
      reason: /map family supports up to 6 authored nodes/,
    },
    {
      name: "spotlight-fifth-callout",
      band: { pattern: "canvas", height: 700, visual: { family: "spotlight", callouts: Array.from({ length: 5 }, (_, index) => callout(index)) } },
      reason: /spotlight family supports up to 4 authored callouts/,
    },
  ];
  for (const item of cases) {
    const specPath = join(temp, `${item.name}.json`);
    const outDir = join(temp, `${item.name}-out`);
    await writeFile(specPath, JSON.stringify(specFor(item.band), null, 2));
    const preflight = await preflightDeck({ specPath, spec: specFor(item.band) });
    assert.equal(preflight.ok, false);
    assert.match(preflight.failures.map(({ reason }) => reason).join("\n"), item.reason);
    const result = spawnSync(process.execPath, [resolve(root, "scripts/build-deck.mjs"), specPath, outDir], {
      cwd: root,
      encoding: "utf8",
      timeout: 120_000,
    });
    assert.notEqual(result.status, 0, `${item.name} must fail before browser work`);
    assert.match(`${result.stdout}${result.stderr}`, item.reason);
    assert.equal(existsSync(join(outDir, "deck.excalidraw")), false, `${item.name} must not publish a partial deck`);
  }
});

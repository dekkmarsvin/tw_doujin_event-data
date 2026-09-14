import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = await readFile(path.join(root, "scripts/check.mjs"));
const event = "events/new-event/";
const flat = new Map(["event.json", "official-booths.json", "reference-selection.json", "map.json", "NOTICE"].map((name) => [event + name, name === "NOTICE" ? "Official source\n" : "{}\n"]));
const scoped = new Map(flat);
scoped.delete(event + "map.json");
scoped.set(event + "circle-identity-groups.json", "{}\n");
scoped.set(event + "map-manifest.json", "{}\n");
scoped.set(event + "maps/1/hall-a.json", "{}\n");
scoped.set(event + "maps/2/hall-b.json", "{}\n");

async function check(files, { existingEvent = false } = {}) {
  const workspace = await mkdtemp(path.join(tmpdir(), "event-data-gate-"));
  try {
    await mkdir(path.join(workspace, "scripts"));
    await writeFile(path.join(workspace, "scripts/check.mjs"), script);
    if (existingEvent) await cp(path.join(root, "events/ff47"), path.join(workspace, "events/ff47"), { recursive: true });
    for (const [relative, content] of files) {
      const destination = path.join(workspace, relative);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, content);
    }
    const result = spawnSync(process.execPath, ["scripts/check.mjs"], { cwd: workspace, encoding: "utf8" });
    if (result.error) throw result.error;
    return { status: result.status, output: result.stdout + result.stderr };
  } finally {
    assert.equal(path.dirname(path.resolve(workspace)), path.resolve(tmpdir()));
    await rm(workspace, { recursive: true, force: true });
  }
}

test("existing FF47 and new flat/scoped publication paths pass the minimal gate", async () => {
  execFileSync(process.execPath, ["scripts/check.mjs"], { cwd: root });
  for (const files of [flat, scoped]) {
    const result = await check(files, { existingEvent: true });
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /2 event folders/);
  }
});

test("event completeness remains required for both map representations", async () => {
  for (const name of ["event.json", "official-booths.json", "reference-selection.json", "NOTICE"]) {
    for (const base of [flat, scoped]) {
      const files = new Map(base); files.delete(event + name);
      const result = await check(files);
      assert.equal(result.status, 1, `missing ${name}: ${result.output}`);
      assert.ok(result.output.includes(`is missing ${name}`));
    }
  }
  for (const [base, remove, expected] of [
    [flat, ["map.json"], /missing map.json or map-manifest.json/],
    [scoped, ["map-manifest.json"], /scoped maps require map-manifest.json/],
    [scoped, ["maps/1/hall-a.json", "maps/2/hall-b.json"], /requires scoped map files/],
  ]) {
    const files = new Map(base); remove.forEach((name) => files.delete(event + name));
    const result = await check(files);
    assert.equal(result.status, 1, result.output); assert.match(result.output, expected);
  }
});

test("new paths retain the JSON, UTF-8, binary and exact path boundaries", async () => {
  for (const [relative, content, expected] of [
    [event + "circle-identity-groups.json", "{", /not valid JSON/],
    [event + "map-manifest.json", Buffer.from([0xff]), /not valid UTF-8/],
    [event + "maps/1/hall-a.json", Buffer.from([0]), /contains binary bytes/],
    [event + "maps/1/nested/hall.json", "{}", /not an allowed event file/],
    [event + "maps/Bad/hall.json", "{}", /not an allowed event file/],
    [event + "maps/1/hall.png", "image", /not an allowed event file/],
    [event + "extra.json", "{}", /not an allowed event file/],
    ["references/record.txt", "text", /not an allowed reference path/],
    ["scripts/extra.mjs", "code", /not a known repository file/],
  ]) {
    const files = new Map(scoped); files.set(relative, content);
    const result = await check(files);
    assert.equal(result.status, 1, result.output); assert.match(result.output, expected);
  }
});

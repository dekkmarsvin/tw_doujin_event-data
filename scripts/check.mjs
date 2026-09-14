// Minimum repository-local gate for the shared data repository.
//
// ADR-0039 keeps the full schema, reference-selection and SHA-256 authority in
// the code repository's pin pull request. This script only rejects what that
// gate cannot see until it is too late: unparseable JSON, paths outside the
// two data trees, bytes ADR-0026 keeps out of the repository, and an event
// folder that ships without its own rights and source notice.
//
// Node built-ins only, so the workflow needs no install step.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TextDecoder } from "node:util";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const META_FILES = new Set([
  ".gitattributes",
  "README.md",
  ".github/CODEOWNERS",
  ".github/workflows/validate.yml",
  "scripts/check.mjs",
  "scripts/check.test.mjs",
]);

const EVENT_ID = /^[a-z0-9][a-z0-9-]*$/;
const EVENT_JSON_FILES = new Set([
  "event.json",
  "official-booths.json",
  "circle-identity-groups.json",
  "map.json",
  "map-manifest.json",
  "reference-selection.json",
]);
const REQUIRED_EVENT_FILES = ["event.json", "official-booths.json", "reference-selection.json", "NOTICE"];
const SCOPED_MAP_PATH = /^maps\/[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*\.json$/;
const EVENT_NOTICE = "NOTICE";
const REFERENCE_PATH = /^references\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*\.json$/;

const failures = [];

function fail(relativePath, message) {
  failures.push(`${relativePath}: ${message}`);
}

async function walk(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const found = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name === ".git") continue;
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...await walk(path.join(directory, entry.name), relativePath));
    else if (entry.isFile()) found.push(relativePath);
    else fail(relativePath, "is neither a regular file nor a directory.");
  }
  return found;
}

// A NUL byte never appears in the UTF-8 text this repository accepts, and it is
// the first byte of every image and archive format ADR-0026 keeps out.
function looksBinary(bytes) {
  return bytes.includes(0);
}

function decodeUtf8(bytes, relativePath) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(relativePath, "is not valid UTF-8.");
    return null;
  }
}

const files = await walk(root);
const eventFolders = new Map();

for (const relativePath of files) {
  const bytes = await readFile(path.join(root, relativePath));
  if (looksBinary(bytes)) {
    fail(relativePath, "contains binary bytes. ADR-0026 keeps floor-plan images and other third-party bytes out of this repository.");
    continue;
  }

  const segments = relativePath.split("/");
  const isEvent = segments[0] === "events";
  const isReference = segments[0] === "references";

  if (isEvent) {
    const [, eventId, ...rest] = segments;
    if (!EVENT_ID.test(eventId ?? "")) {
      fail(relativePath, "must use a valid events/<eventId>/ directory.");
      continue;
    }
    const name = rest.join("/");
    if (!EVENT_JSON_FILES.has(name) && name !== EVENT_NOTICE && !SCOPED_MAP_PATH.test(name)) {
      fail(relativePath, `is not an allowed event file. Allowed: ${[...EVENT_JSON_FILES, EVENT_NOTICE].join(", ")}, maps/<dayId>/<venueSpaceId>.json.`);
      continue;
    }
    if (!eventFolders.has(eventId)) eventFolders.set(eventId, new Set());
    eventFolders.get(eventId).add(name);
  } else if (isReference) {
    if (!REFERENCE_PATH.test(relativePath)) {
      fail(relativePath, "is not an allowed reference path. references/ holds JSON records only.");
      continue;
    }
  } else if (!META_FILES.has(relativePath)) {
    fail(relativePath, "is outside references/ and events/<eventId>/, and is not a known repository file.");
    continue;
  }

  const text = decodeUtf8(bytes, relativePath);
  if (text === null) continue;
  if (relativePath.endsWith(".json")) {
    try {
      JSON.parse(text);
    } catch (error) {
      fail(relativePath, `is not valid JSON: ${error.message}`);
    }
  }
}

for (const [eventId, names] of [...eventFolders].sort()) {
  for (const required of REQUIRED_EVENT_FILES) {
    if (!names.has(required)) fail(`events/${eventId}`, `is missing ${required}.`);
  }
  const hasManifest = names.has("map-manifest.json");
  const hasScopedMap = [...names].some((name) => SCOPED_MAP_PATH.test(name));
  if (!hasManifest && !names.has("map.json")) fail(`events/${eventId}`, "is missing map.json or map-manifest.json.");
  if (hasScopedMap && !hasManifest) fail(`events/${eventId}`, "scoped maps require map-manifest.json.");
  if (hasManifest && !hasScopedMap) fail(`events/${eventId}`, "map-manifest.json requires scoped map files.");
}

if (eventFolders.size === 0) failures.push("events/: the repository has no event folder.");

if (failures.length > 0) {
  console.error(`${failures.length} problem${failures.length === 1 ? "" : "s"}:`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Checked ${files.length} files across ${eventFolders.size} event folder${eventFolders.size === 1 ? "" : "s"}.`);
}

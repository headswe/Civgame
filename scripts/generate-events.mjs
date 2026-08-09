#!/usr/bin/env node
/**
 * Generates one banner illustration per ruin type, used as the header art of
 * the scavenging event dialog.
 *
 * Usage:
 *   IMAGE_API_KEY=<key> node scripts/generate-events.mjs [ruinKind ...]
 */
import { mkdir, writeFile } from "node:fs/promises";

const ENDPOINT =
  process.env.IMAGE_ENDPOINT ??
  "https://ai-asdasd-test-001.cognitiveservices.azure.com/openai/deployments/gpt-image-2/images/generations?api-version=2024-02-01";
const KEY = process.env.IMAGE_API_KEY;
if (!KEY) {
  console.error("Set IMAGE_API_KEY. The key is never stored in the repo.");
  process.exit(1);
}

const STYLE =
  "Painterly post-apocalyptic concept art illustration for a strategy game event card. " +
  "Wide establishing shot, no text, no logos, no user interface. Muted desaturated palette of " +
  "ochre dust, ash grey and rust, heavy atmospheric haze, dramatic low sunlight. " +
  "Small robot scavenger drones with glowing lamp-eyes picking through the wreckage for scale.";

const SCENES = {
  city: "A canyon of gutted pre-collapse skyscrapers, collapsed office floors spilling desks and cabling, " +
    "shafts of dusty light through broken curtain-wall glass, drifts of rubble and paper in the street.",
  suburb: "A dead suburban cul-de-sac: burnt-out houses with collapsed roofs, cracked driveways, dead lawns, " +
    "a rusted water tower leaning over the rooftops, children's toys half-buried in ash.",
  bunker: "The entrance to a buried military bunker: a massive rusted blast door part-open in a concrete berm, " +
    "sandbag emplacements, dim red emergency lighting spilling from inside, warning stripes worn to nothing.",
  trench: "An abandoned trench line cut through churned mud: rotting duckboards, collapsed sandbag revetments, " +
    "tangles of razor wire, scattered helmets and ammunition crates, low fog clinging to the ground.",
};

const wanted = process.argv.slice(2);
const list = wanted.length ? wanted : Object.keys(SCENES);
await mkdir(new URL("../public/events/", import.meta.url), { recursive: true });

for (const name of list) {
  const desc = SCENES[name];
  if (!desc) {
    console.error(`Unknown ruin kind "${name}". Known: ${Object.keys(SCENES).join(", ")}`);
    process.exit(1);
  }
  process.stdout.write(`Generating ${name}... `);
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": KEY },
    body: JSON.stringify({ prompt: `${STYLE} ${desc}`, size: "1024x1024", n: 1 }),
  });
  if (!res.ok) {
    console.error(`FAILED (${res.status}): ${(await res.text()).slice(0, 300)}`);
    process.exit(1);
  }
  const json = await res.json();
  const item = json.data?.[0] ?? {};
  const bytes = item.b64_json
    ? Buffer.from(item.b64_json, "base64")
    : Buffer.from(await (await fetch(item.url)).arrayBuffer());
  await writeFile(new URL(`../public/events/${name}.png`, import.meta.url), bytes);
  console.log(`ok (${(bytes.length / 1024).toFixed(0)} KB)`);
}
console.log("Done. Event art in public/events/ — commit it.");

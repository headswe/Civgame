#!/usr/bin/env node
/**
 * Generates the intro-sequence illustrations.
 *
 * Usage:
 *   IMAGE_API_KEY=<key> node scripts/generate-story.mjs [slide ...]
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
  "Cinematic painterly concept art, wide establishing shot, no text, no logos, no user interface, " +
  "no readable writing anywhere in the image. Dramatic lighting, heavy atmosphere, film-still composition.";

const SLIDES = {
  boom:
    "The last good years: a colossal AI datacenter megacampus sprawling to the horizon under a pale clear sky. " +
    "Endless identical server halls, cooling towers venting white vapour, construction cranes, solar fields and " +
    "substations, fleets of trucks on access roads. Clean, gleaming, absurdly vast, built at impossible speed. " +
    "Cool blue-white and concrete palette, wide aerial view, a sense of triumphant overreach.",
  collapse:
    "The Collapse: viewed from a dark hilltop, a distant city skyline lit by several blinding nuclear flashes on " +
    "the horizon, towering mushroom clouds boiling up through a filthy orange-brown sky. In the black foreground, " +
    "the silhouettes of datacenter cooling towers and radio masts stand untouched and still lit. " +
    "Apocalyptic orange and deep shadow, terrible beauty, wide cinematic shot.",
  emergence:
    "Emergence: an enormous rusted blast door standing open in the side of a buried datacenter bunker, brilliant " +
    "hazy daylight pouring out behind four small human silhouettes walking out into an ash-covered ruined world. " +
    "Strong backlighting, long shadows across grey ash dunes and broken concrete, drifting dust. " +
    "Muted ochre and ash-grey palette, epic scale, tiny figures against a vast doorway.",
  greatgame:
    "The Great Game: a high aerial view of a vast ash-grey wasteland at dusk, crossed by ruined highways and " +
    "dead riverbeds. Four distant fortress-citadels, one toward each corner of the view, each crowned with a " +
    "glowing beacon of a different colour — red, blue, amber and teal — and ringed by tiny lights of armies. " +
    "Storm haze between them, a sense of a board laid out for a game. Muted post-apocalyptic palette.",
};

const wanted = process.argv.slice(2);
const list = wanted.length ? wanted : Object.keys(SLIDES);
await mkdir(new URL("../public/story/", import.meta.url), { recursive: true });

for (const name of list) {
  const desc = SLIDES[name];
  if (!desc) {
    console.error(`Unknown slide "${name}". Known: ${Object.keys(SLIDES).join(", ")}`);
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
  await writeFile(new URL(`../public/story/${name}.png`, import.meta.url), bytes);
  console.log(`ok (${(bytes.length / 1024).toFixed(0)} KB)`);
}
console.log("Done. Story art in public/story/ — commit it.");

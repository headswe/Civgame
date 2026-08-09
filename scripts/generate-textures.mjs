#!/usr/bin/env node
/**
 * Generates seamless ground textures for each terrain type via an Azure
 * OpenAI gpt-image deployment, writing them to public/textures/.
 *
 * Usage:
 *   IMAGE_API_KEY=<key> [IMAGE_ENDPOINT=<url>] node scripts/generate-textures.mjs [terrain ...]
 *
 * The API key is intentionally read from the environment — never commit it.
 * With no arguments, all terrains are generated; pass names (e.g. "wastes
 * slag") to regenerate a subset.
 */
import { mkdir, writeFile } from "node:fs/promises";

const ENDPOINT =
  process.env.IMAGE_ENDPOINT ??
  "https://ai-asdasd-test-001.cognitiveservices.azure.com/openai/deployments/gpt-image-2/images/generations?api-version=2024-02-01";
const KEY = process.env.IMAGE_API_KEY;
if (!KEY) {
  console.error("Set IMAGE_API_KEY (and optionally IMAGE_ENDPOINT). The key is never stored in the repo.");
  process.exit(1);
}

const STYLE =
  "Seamless tileable top-down ground texture for a stylized post-apocalyptic strategy game. " +
  "Hand-painted look, muted desaturated palette, even diffuse lighting, fine detail. " +
  "Strictly flat ground seen from directly above: no objects, no buildings, no text, no borders, no vignette.";

const TERRAINS = {
  wastes: "Cracked dry wasteland dirt, dusty ochre-brown earth with hairline cracks and scattered pebbles.",
  ashdunes: "Fine gray volcanic ash with soft wind ripples, pale gray dust drifts.",
  highlands: "Weathered rocky plateau, brown fractured stone slabs with dusty crevices.",
  ruins: "Shattered pre-war concrete and asphalt rubble, gray-blue broken slabs, faint rebar stains, dusty.",
  slag: "Cooled black slag crust with thin glowing orange cracks, like a dormant lava field.",
  geovent: "Scorched dark basalt around mineral-crusted fumarole ground, faint teal mineral deposits.",
};

const wanted = process.argv.slice(2);
const list = wanted.length ? wanted : Object.keys(TERRAINS);
await mkdir(new URL("../public/textures/", import.meta.url), { recursive: true });

for (const name of list) {
  const desc = TERRAINS[name];
  if (!desc) {
    console.error(`Unknown terrain "${name}". Known: ${Object.keys(TERRAINS).join(", ")}`);
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
  let bytes;
  if (item.b64_json) {
    bytes = Buffer.from(item.b64_json, "base64");
  } else if (item.url) {
    bytes = Buffer.from(await (await fetch(item.url)).arrayBuffer());
  } else {
    console.error(`FAILED: unexpected response shape: ${JSON.stringify(json).slice(0, 300)}`);
    process.exit(1);
  }
  const out = new URL(`../public/textures/ground_${name}.png`, import.meta.url);
  await writeFile(out, bytes);
  console.log(`ok (${(bytes.length / 1024).toFixed(0)} KB)`);
}
console.log("Done. Textures land in public/textures/ — commit them so the deployed game gets them.");

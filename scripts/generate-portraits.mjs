#!/usr/bin/env node
/**
 * Generates faction leader portraits via an Azure OpenAI gpt-image deployment.
 *
 * Usage:
 *   IMAGE_API_KEY=<key> node scripts/generate-portraits.mjs [faction ...]
 *
 * These are original fictional characters built from each faction's theme —
 * archetypes, not likenesses of any real person. The satire lives in the
 * writing, not in impersonation.
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
  "Painterly stylized video-game faction leader portrait, head and shoulders, square composition, " +
  "facing the viewer, dramatic rim lighting, muted desaturated post-apocalyptic palette, ash haze background, " +
  "concept art illustration, NOT a photograph. The subject is an entirely fictional invented character " +
  "and must not resemble any real living person.";

const PORTRAITS = {
  dominion:
    "A swaggering warlord of a rocket cult: scorched red-and-black flight jacket with singed collar, " +
    "cracked flight visor pushed up on the forehead, soot-streaked stubbled face, arrogant crooked smirk, " +
    "red accent lighting, faint gantry silhouettes in the haze behind.",
  collective:
    "An impassive hive-overlord: seamless chrome visor band covering the eyes, unnaturally smooth pale skin, " +
    "high-collared slate-grey uniform with thin glowing blue circuit trim, utterly blank expression, " +
    "cold blue rim lighting, faint grid pattern in the haze behind.",
  caliphate:
    "A logistics tyrant: bald, broad-shouldered, amber-trimmed quilted work tunic with cargo webbing and a " +
    "heavy ring of warehouse keys, arms folded, smug confident grin, warm amber lighting, " +
    "stacked shipping-container silhouettes in the haze behind.",
  papacy:
    "A slender ascetic prophet: pale ivory and teal vestments, hands clasped, serene and faintly unsettling smile, " +
    "a thin glowing hexagonal halo of light hovering behind the head, soft teal glow, " +
    "cathedral-like server monoliths in the haze behind.",
};

const wanted = process.argv.slice(2);
const list = wanted.length ? wanted : Object.keys(PORTRAITS);
await mkdir(new URL("../public/portraits/", import.meta.url), { recursive: true });

for (const name of list) {
  const desc = PORTRAITS[name];
  if (!desc) {
    console.error(`Unknown faction "${name}". Known: ${Object.keys(PORTRAITS).join(", ")}`);
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
  await writeFile(new URL(`../public/portraits/${name}.png`, import.meta.url), bytes);
  console.log(`ok (${(bytes.length / 1024).toFixed(0)} KB)`);
}
console.log("Done. Portraits in public/portraits/ — commit them.");

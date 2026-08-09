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
  "Satirical caricature portrait for a video game faction leader, head and shoulders, square composition, " +
  "facing the viewer. Editorial-cartoon caricature style: painterly brushwork with knowingly exaggerated " +
  "features — an oversized head, overstated jaw, nose and expression — obviously an illustrated caricature " +
  "rather than a photograph. Muted desaturated post-apocalyptic palette, ash haze background, dramatic rim lighting.";

const PORTRAITS = {
  dominion:
    "A smug rocket-obsessed tech baron in his early fifties: broad puffy face, heavy jaw, thinning dark hair " +
    "swept back from a high forehead, faint stubble, a tight self-satisfied smirk with the chin tipped up. " +
    "Wearing a scorched black bomber jacket over a black shirt, a red rocket emblem on the chest, " +
    "flight goggles shoved up on his head. Red accent lighting, launch-gantry silhouettes in the haze behind.",
  collective:
    "An eerily blank young tech overlord: very pale smooth skin, wide unblinking eyes, a blunt straight fringe " +
    "of light-brown hair cut flat across the forehead, rigid neutral expression like a mask of politeness. " +
    "Wearing a plain grey crew-neck shirt under a high-collared slate uniform with thin glowing blue circuit trim. " +
    "Cold blue rim lighting, a faint grid pattern in the haze behind.",
  caliphate:
    "A gleeful bald logistics tycoon in his late fifties: shaved head, thick neck, powerful gym-built shoulders, " +
    "a huge open toothy grin with deep laugh lines and crinkled eyes. Wearing an amber-trimmed quilted work gilet " +
    "over a rugged shirt, with a heavy chain of warehouse keys. Warm amber lighting, " +
    "stacked shipping-container silhouettes in the haze behind.",
  papacy:
    "A boyish AI prophet in his late thirties: slim build, softly rounded youthful face, tousled light-brown hair, " +
    "a serene knowing half-smile that does not reach the eyes, hands clasped as if in benediction. " +
    "Wearing pale ivory and teal techwear vestments over a plain shirt, a thin glowing hexagonal halo of light " +
    "hovering behind his head. Soft teal glow, cathedral-like server monoliths in the haze behind.",
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

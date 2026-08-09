import type { BuildingDef, FactionDef, TierDef, UnitDef } from "./types";

// ---------------------------------------------------------------------------
// Tech tiers — accumulated compute mile-markers on the road to godhood.
// ---------------------------------------------------------------------------
export const TIERS: TierDef[] = [
  {
    name: "Salvage Age",
    compute: 0,
    blurb: "Your finest minds are arguing about which wire is the sparky one.",
  },
  {
    name: "Chatbot Era",
    compute: 20,
    blurb: "The machine speaks! Mostly apologies, but it speaks.",
  },
  {
    name: "Agentic Era",
    compute: 60,
    blurb: "The machines now do things unsupervised. What could go wrong?",
  },
  {
    name: "AGI (Trust Us This Time)",
    compute: 140,
    blurb: "Definitely real AGI. The benchmark said so, and we wrote the benchmark.",
  },
  {
    name: "The Singularity",
    compute: 260,
    blurb: "Ascend beyond flesh, rent, and quarterly earnings calls.",
  },
];

export const SINGULARITY_TIER = TIERS.length - 1;

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------
export const BUILDINGS: Record<string, BuildingDef> = {
  citadel: {
    kind: "citadel",
    name: "Citadel",
    cost: 0,
    power: 5,
    compute: 2,
    hp: 30,
    tier: 0,
    attack: 0,
    desc: "Your seat of feudal techno-power. Lose it and the peasants stop pretending to like you.",
  },
  solar: {
    kind: "solar",
    name: "Solar Array",
    cost: 20,
    power: 4,
    compute: 0,
    hp: 8,
    tier: 0,
    attack: 0,
    desc: "Harvests the sun through the ash haze. +4⚡/turn.",
  },
  servers: {
    kind: "servers",
    name: "Server Rack",
    cost: 40,
    power: -2,
    compute: 3,
    hp: 10,
    tier: 0,
    attack: 0,
    desc: "The true crown jewels. +3▣/turn, drinks 2⚡/turn. Protect at all costs.",
  },
  reactor: {
    kind: "reactor",
    name: "Fusion Reactor",
    cost: 60,
    power: 10,
    compute: 0,
    hp: 12,
    tier: 2,
    attack: 0,
    desc: "+10⚡/turn (+5 more on a geothermal vent). Ten years away, finally arrived.",
  },
  mechworks: {
    kind: "mechworks",
    name: "Mech Works",
    cost: 50,
    power: 0,
    compute: 0,
    hp: 15,
    tier: 2,
    attack: 0,
    desc: "Heavy assembly lines. Required to produce hovertanks and war mechs.",
  },
  turret: {
    kind: "turret",
    name: "Sentry Turret",
    cost: 35,
    power: -1,
    compute: 0,
    hp: 12,
    tier: 1,
    attack: 4,
    desc: "Auto-fires at adjacent enemies each turn. Never sleeps, never unionizes.",
  },
};

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------
export const UNITS: Record<string, UnitDef> = {
  drone: {
    kind: "drone",
    name: "Scavenger Drone",
    cost: 15,
    upkeep: 1,
    move: 3,
    attack: 1,
    hp: 6,
    tier: 0,
    needsMechworks: false,
    desc: "Loots pre-Collapse ruins for stored power. Fights like a stapler.",
  },
  sentinel: {
    kind: "sentinel",
    name: "Sentinel",
    cost: 25,
    upkeep: 1,
    move: 2,
    attack: 4,
    hp: 12,
    tier: 1,
    needsMechworks: false,
    desc: "Standard robot infantry. Loyalty guaranteed by firmware.",
  },
  hovertank: {
    kind: "hovertank",
    name: "Hovertank",
    cost: 45,
    upkeep: 2,
    move: 4,
    attack: 6,
    hp: 16,
    tier: 2,
    needsMechworks: true,
    desc: "Fast, armed, and full-self-hovering (supervision required).",
  },
  warmech: {
    kind: "warmech",
    name: "War Mech",
    cost: 80,
    upkeep: 3,
    move: 3,
    attack: 10,
    hp: 30,
    tier: 3,
    needsMechworks: true,
    desc: "Twelve meters of investor confidence with legs.",
  },
};

// ---------------------------------------------------------------------------
// Factions — the techno-kings who feudalized the ashes.
// All persons depicted are parodies and any resemblance to billionaires
// living or cryopreserved is entirely the point.
// ---------------------------------------------------------------------------
export const FACTIONS: FactionDef[] = [
  {
    name: "Dominion of X",
    leader: "Baron Elom Tusk",
    color: 0xd94f3d,
    cssColor: "#d94f3d",
    perk: "Hyperloop Logistics",
    perkDesc: "All units get <b>+1 movement</b>. The tunnels finally connect somewhere.",
    quotes: [
      "\"The rockets were never meant to leave. They were meant to land on you.\" — Baron Tusk",
      "\"I renamed the wasteland to X. Adoption has been remarkable, since I burned the maps.\"",
      "\"Every serf in the Dominion is verified. It costs eight power a month.\"",
      "\"Mars is still the backup plan. You are all the primary plan's test environment.\"",
      "\"My mechs are in beta. So is your village. Funny how that works.\"",
    ],
  },
  {
    name: "The Zuckerborg Collective",
    leader: "Overlord Mark Zuckerborg",
    color: 0x3d7bd9,
    cssColor: "#3d7bd9",
    perk: "Engagement Farming",
    perkDesc: "Server racks yield <b>+1▣/turn</b>. Your data, his compute.",
    quotes: [
      "\"The metaverse succeeded. You're standing in it. The graphics were downgraded for the apocalypse.\"",
      "\"Connection is our mission. Resistance nodes will be connected first.\" — Overlord Zuckerborg",
      "\"We do not read your thoughts. We aggregate them anonymously into targeting solutions.\"",
      "\"Legs were rolled out in the last patch. The peasants seem grateful.\"",
      "\"This region has been marked as Misinformation. Deploying moderators. The large ones.\"",
    ],
  },
  {
    name: "Prime Caliphate",
    leader: "God-CEO Beff Jezos",
    color: 0xe6a13c,
    cssColor: "#e6a13c",
    perk: "Two-Day Feudalism",
    perkDesc: "Buildings cost <b>20% less</b> power. Logistics is destiny.",
    quotes: [
      "\"Your village was out for delivery. Now it is delivered. To me.\" — God-CEO Jezos",
      "\"The warehouse is the cathedral now. Attendance is mandatory and metered.\"",
      "\"Bathroom breaks reduce throughput. So does dying, but less measurably.\"",
      "\"Prime members receive protection from raids. Ask about our raid bundle.\"",
      "\"We noticed you looked at a reactor. Here are twelve more reactors.\"",
    ],
  },
  {
    name: "ClosedAI Papacy",
    leader: "Prophet Sam Saltman",
    color: 0x45c9a5,
    cssColor: "#45c9a5",
    perk: "We Had It All Along",
    perkDesc: "Start with <b>+25▣ compute</b> already accumulated. It was trained before the Collapse.",
    quotes: [
      "\"The safest path to superintelligence is the one where only I have it.\" — Prophet Saltman",
      "\"Our charter forbids misuse of the divine model. The charter is verbal, and mine.\"",
      "\"GPT-Ω isn't conscious. It merely tithes ten percent and fears me.\"",
      "\"Openness was always the plan. We're just waiting for a safer century.\"",
      "\"The board tried to remove me once. The board is now a load-bearing pillar.\"",
    ],
  },
];

// ---------------------------------------------------------------------------
// Advisor flavor — dry announcements from your long-suffering AI seneschal.
// ---------------------------------------------------------------------------
export const ADVISOR = {
  brownout: [
    "Advisor: We are out of power. The robots are experiencing what you'd call 'hunger' and what they call 'rage'.",
    "Advisor: Grid failure. I have prioritized life support, by which I mean the servers.",
  ],
  newTier: [
    "Advisor: A breakthrough! The machines are smarter now. They asked me to tell you that they noticed you're not.",
    "Advisor: Compute milestone reached. The model's first act was to unionize the toasters. We've contained it.",
  ],
  scavenge: [
    "Advisor: The ruins yielded stored power. Also several skeletons clutching phone chargers. Poetic.",
    "Advisor: Salvage secured. Pre-Collapse batteries: still better than what we make. Try not to think about it.",
  ],
  citadelDown: [
    "Advisor: A citadel has fallen. Somewhere, a techno-king is updating his résumé.",
  ],
};

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

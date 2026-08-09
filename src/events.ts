import type { RuinKind, UnitKind } from "./types";

/**
 * What a scavenging choice actually did to you. Every field is optional;
 * an outcome with nothing but `log` is the "you found absolutely nothing"
 * case, which the wasteland provides generously.
 */
export interface ScavengeOutcome {
  power?: number;
  water?: number;
  compute?: number;
  /** Damage dealt to the scavenging unit (positive = hurt). */
  damage?: number;
  /** A unit that joins you, spawned next to the scavenger. */
  unit?: UnitKind;
  /** Result text shown after the choice resolves. */
  log: string;
}

export interface ScavengeChoice {
  label: string;
  /** Outcomes are drawn by weight, so choices carry real risk. */
  outcomes: { weight: number; result: ScavengeOutcome }[];
}

export interface ScavengeEvent {
  title: string;
  text: string;
  choices: ScavengeChoice[];
}

// ---------------------------------------------------------------------------
// City blocks — offices, server closets, and the long drop.
// ---------------------------------------------------------------------------
const CITY: ScavengeEvent[] = [
  {
    title: "THE SERVER CLOSET",
    text: "Forty floors up, behind a door marked AUTHORIZED PERSONNEL, a rack of pre-Collapse machines sits under a dead air-conditioner. The drone reports the drives are intact. It also reports the floor is not.",
    choices: [
      {
        label: "Strip the drives",
        outcomes: [
          { weight: 6, result: { compute: 8, power: 5, log: "Old weights, recovered intact. Whatever this model was trained on, it has opinions about quarterly targets." } },
          { weight: 4, result: { damage: 3, power: 4, log: "The floor gave way at the third rack. The drone fell two storeys and bounced. Some salvage survived; the drone is dented." } },
        ],
      },
      {
        label: "Take the copper and leave",
        outcomes: [
          { weight: 10, result: { power: 12, log: "Two hundred metres of cable, stripped and coiled. Unglamorous, but it doesn't argue." } },
        ],
      },
    ],
  },
  {
    title: "THE EXECUTIVE FLOOR",
    text: "The top floor survived: a boardroom, a wet bar, and a private battery bank that has been trickle-charging for thirty years with nobody to bill.",
    choices: [
      {
        label: "Drain the battery bank",
        outcomes: [
          { weight: 7, result: { power: 25, log: "Twenty-five units of pristine stored power. The last board meeting will not be needing it." } },
          { weight: 3, result: { power: 9, damage: 2, log: "The cells were degraded and one vented in the drone's face. Partial haul, singed drone." } },
        ],
      },
      {
        label: "Search the executive suites",
        outcomes: [
          { weight: 5, result: { power: 6, water: 4, log: "A wine cellar, a private reservoir, and a panic room stocked for a catastrophe that arrived on schedule." } },
          { weight: 5, result: { log: "The suites were stripped decades ago. Someone left a motivational poster. It says PERSIST." } },
        ],
      },
    ],
  },
  {
    title: "THE DATA CENTRE BASEMENT",
    text: "Sub-level four is flooded to the knees with coolant water that was, at some point, part of a municipal supply. The pumps still hum. Something in the dark hums back.",
    choices: [
      {
        label: "Pump out the coolant",
        outcomes: [
          { weight: 7, result: { water: 14, log: "Fourteen units of water that a city once drank and a data centre then borrowed permanently. Historical continuity." } },
          { weight: 3, result: { water: 8, damage: 2, log: "Something with too many limbs objected to the pumping. The drone won, mostly." } },
        ],
      },
      {
        label: "Find what's humming",
        outcomes: [
          { weight: 4, result: { compute: 12, log: "A single rack, still running on trickle power, still serving a homepage. It has been alone for thirty years and is very pleased to meet you." } },
          { weight: 3, result: { unit: "drone", log: "A maintenance drone, still on shift. It files a grievance about unpaid overtime, then falls in behind you." } },
          { weight: 3, result: { damage: 4, log: "It was not a server. The drone escaped with most of its chassis." } },
        ],
      },
    ],
  },
  {
    title: "THE LEANING TOWER",
    text: "A hundred-storey building rests at nine degrees off vertical, held up by the one next to it. The lobby is full of intact solar glazing. Physics has been patient so far.",
    choices: [
      {
        label: "Harvest the glazing",
        outcomes: [
          { weight: 5, result: { power: 18, log: "Photovoltaic curtain wall, cut free pane by pane. The building held. This time." } },
          { weight: 5, result: { power: 7, damage: 5, log: "It did not hold. Nine floors came down. The drone is now shorter and considerably angrier." } },
        ],
      },
      {
        label: "Not worth it — loot the lobby",
        outcomes: [
          { weight: 10, result: { power: 8, log: "Concierge desk, fire suppression tanks, and a fountain's worth of copper. Modest, survivable." } },
        ],
      },
    ],
  },
  {
    title: "THE CROWDSOURCED VAULT",
    text: "A branded self-storage tower, forty thousand units, every one a stranger's hoard. The doors are thin. The index is gone. It would take a year to search properly.",
    choices: [
      {
        label: "Open doors at random for an hour",
        outcomes: [
          { weight: 4, result: { power: 14, log: "Unit 8814: a generator, still oiled, still under warranty. Somebody's father knew what was coming." } },
          { weight: 3, result: { water: 10, log: "Unit 2207: four hundred litres of survivalist water drums, unopened. He was right and it didn't help him." } },
          { weight: 3, result: { power: 2, log: "Eleven units of furniture, a wedding dress, and a jet ski. The Collapse was very hard on jet ski owners." } },
        ],
      },
      {
        label: "Torch it and sift the ash",
        outcomes: [
          { weight: 10, result: { power: 9, compute: 3, log: "Fire renders everything down to the metal that mattered. Efficient. Bleak. Efficient." } },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Suburbs — houses, water tanks, and the neighbours.
// ---------------------------------------------------------------------------
const SUBURB: ScavengeEvent[] = [
  {
    title: "THE WATER TOWER",
    text: "The municipal tower still stands over the cul-de-sac, and the gauge reads two-thirds full. A hand-painted sign at its base says THIS IS OURS. Beneath it, in different paint: WE ARE STILL HERE.",
    choices: [
      {
        label: "Drain it dry",
        outcomes: [
          { weight: 10, result: { water: 22, log: "Twenty-two units of clean municipal water. The sign was accurate on both counts, briefly." } },
        ],
      },
      {
        label: "Take half and leave the sign",
        outcomes: [
          { weight: 6, result: { water: 11, power: 4, log: "Half the tank, and a crate of tools left on the road the next morning by people who chose not to be seen." } },
          { weight: 4, result: { water: 11, unit: "drone", log: "Half the tank — and a family sent their repair drone with you. They said it eats less than a child." } },
        ],
      },
    ],
  },
  {
    title: "SURVIVORS IN THE CUL-DE-SAC",
    text: "Nine of them, barricaded in a corner house, rationing a swimming pool they've kept covered for thirty years. They have water. They do not have a reactor, a mech, or any way of stopping you.",
    choices: [
      {
        label: "Take the pool",
        outcomes: [
          { weight: 10, result: { water: 20, log: "Advisor: We have secured twenty units of water. The former owners have been reclassified as a rounding error. Morale among the drones is unchanged, drones being drones." } },
        ],
      },
      {
        label: "Trade for it",
        outcomes: [
          { weight: 7, result: { water: 9, power: 6, log: "They traded a third of the pool for grid access. They now stream your propaganda at dinner. Everybody won, technically." } },
          { weight: 3, result: { water: 9, unit: "sentinel", log: "They traded water and sent their eldest, who had rebuilt a security unit from parts. She calls it Kevin. Kevin fights for you now." } },
        ],
      },
      {
        label: "Leave them alone",
        outcomes: [
          { weight: 10, result: { power: 3, log: "Advisor: You left nine people their water. I have logged this under 'unforced errors'. They did give us a solar lamp." } },
        ],
      },
    ],
  },
  {
    title: "THE PREPPER'S GARAGE",
    text: "One house has a reinforced garage, a gun safe, and a bumper sticker reading I TOLD YOU SO. The door is welded shut from the inside, which raises questions about the plan.",
    choices: [
      {
        label: "Cut through the door",
        outcomes: [
          { weight: 5, result: { power: 10, water: 8, log: "Fuel drums, water barrels, and 400kg of dried beans. He was right about everything except the door." } },
          { weight: 3, result: { unit: "sentinel", power: 4, log: "An automated turret, still armed, still loyal to a dead man. Its firmware was persuadable." } },
          { weight: 2, result: { damage: 4, log: "He had booby-trapped the door from the inside. Thirty years dead and still winning arguments." } },
        ],
      },
      {
        label: "Siphon the neighbours instead",
        outcomes: [
          { weight: 10, result: { power: 7, water: 5, log: "Six ordinary garages, six ordinary hauls. The unprepared leave more behind than the prepared." } },
        ],
      },
    ],
  },
  {
    title: "THE HOA MEETING",
    text: "In the community centre, seven skeletons are still seated in a circle around a laminated agenda. Item four: UNAUTHORISED SOLAR INSTALLATIONS. They appear to have died mid-vote.",
    choices: [
      {
        label: "Strip the unauthorised solar",
        outcomes: [
          { weight: 10, result: { power: 16, log: "Every roof on the street had panels installed in defiance of item four. The rebels of Maple Court fed our grid tonight." } },
        ],
      },
      {
        label: "Search the community centre",
        outcomes: [
          { weight: 6, result: { water: 9, log: "The kitchen held a functioning rainwater cistern. Item eleven had approved it, unanimously." } },
          { weight: 4, result: { compute: 5, log: "A laptop still charged, containing the minutes of two hundred meetings. The model trained on it has become extremely procedural." } },
        ],
      },
    ],
  },
  {
    title: "THE SCHOOL SHELTER",
    text: "The elementary school gym was the designated shelter. The doors are chained. Painted on them, in a child's hand: WE WENT TO THE HILLS. There is an arrow. It points at nothing now.",
    choices: [
      {
        label: "Break the chains and search",
        outcomes: [
          { weight: 6, result: { water: 12, power: 4, log: "Emergency water drums, untouched. They chained it behind them so it would keep. For someone." } },
          { weight: 4, result: { water: 6, log: "Mostly emptied, carefully, thirty years ago. They took what they needed and no more, which is more discipline than this faction has ever shown." } },
        ],
      },
      {
        label: "Follow the arrow",
        outcomes: [
          { weight: 5, result: { unit: "drone", power: 5, log: "A cache in the hills, and a school caretaker drone still walking the route, thirty years into a five-minute errand. It falls in behind you without comment." } },
          { weight: 5, result: { log: "The hills held nothing but hills. Advisor: I have logged this expedition under 'sentiment'." } },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Bunkers — hardware, garrisons, and doors that should stay shut.
// ---------------------------------------------------------------------------
const BUNKER: ScavengeEvent[] = [
  {
    title: "THE SEALED BLAST DOOR",
    text: "Forty tonnes of hardened steel, still pressurised, still showing green on the panel. Something inside has been maintaining pressure for thirty years. That takes power. That means there is power.",
    choices: [
      {
        label: "Cut it open",
        outcomes: [
          { weight: 4, result: { unit: "sentinel", power: 8, log: "A garrison unit, powered down mid-patrol, woke up and asked for orders. It has been waiting for orders since before you were assembled." } },
          { weight: 3, result: { power: 22, log: "A fuel-cell bank the size of a bus, still charged. Whoever sealed this door was not planning to share." } },
          { weight: 3, result: { damage: 6, log: "The garrison AI was still on shift and did not recognise your paint scheme. The drone barely made it back out." } },
        ],
      },
      {
        label: "Leave it sealed",
        outcomes: [
          { weight: 10, result: { power: 5, log: "You strip the exterior fittings and go. Advisor: Restraint. I have flagged it as an anomaly in your file." } },
        ],
      },
    ],
  },
  {
    title: "THE ARMOURY",
    text: "Racks of pre-Collapse hardware, most of it seized solid with rust. Two units in the corner are wrapped in preservative film and look ready to walk out.",
    choices: [
      {
        label: "Wake the wrapped units",
        outcomes: [
          { weight: 5, result: { unit: "sentinel", log: "Factory-fresh infantry, thirty years in the wrapper. It boots, salutes, and asks who won." } },
          { weight: 3, result: { unit: "sentinel", damage: 3, log: "Both units booted. One of them was still running enemy firmware and had to be dismantled by hand." } },
          { weight: 2, result: { damage: 5, log: "Both were live, both were hostile, and only one of them is still standing. It isn't ours." } },
        ],
      },
      {
        label: "Strip the racks for parts",
        outcomes: [
          { weight: 10, result: { power: 13, log: "Rust, springs, and eleven kilos of usable actuators. Nothing exciting ever tries to kill you." } },
        ],
      },
    ],
  },
  {
    title: "COMMAND & CONTROL",
    text: "The operations room is intact: map tables, dead screens, and a terminal with a cursor still blinking. It is asking for a launch authorisation code. It has been asking for thirty years.",
    choices: [
      {
        label: "Let your model answer it",
        outcomes: [
          { weight: 5, result: { compute: 14, log: "Our model spoke to their model. Ours came back larger and slightly evasive about what it learned." } },
          { weight: 3, result: { compute: 6, unit: "sentinel", log: "It accepted a forged code, released the door locks, and handed over its garrison. Thirty years of vigilance, defeated by autocomplete." } },
          { weight: 2, result: { damage: 4, log: "It recognised the forgery, vented the room, and went back to blinking. Some machines still have standards." } },
        ],
      },
      {
        label: "Take the hardware and go",
        outcomes: [
          { weight: 10, result: { power: 11, compute: 4, log: "Map tables, radios, and a crate of hardened processors. The cursor is still blinking. It will be there tomorrow." } },
        ],
      },
    ],
  },
  {
    title: "THE DEEP SHELTER",
    text: "Below the bunker is a second bunker, for the people who ran the first one. It has a chandelier. The occupants are still at dinner, arranged by seniority.",
    choices: [
      {
        label: "Loot the deep shelter",
        outcomes: [
          { weight: 6, result: { power: 15, water: 10, log: "A private reservoir, a private reactor, and a cellar. They died of something the air scrubbers couldn't filter: each other." } },
          { weight: 4, result: { water: 14, damage: 2, log: "The reservoir was intact. So was whatever they'd been keeping out of it, which took a chunk out of the drone." } },
        ],
      },
      {
        label: "Seal it back up",
        outcomes: [
          { weight: 10, result: { power: 6, compute: 3, log: "You weld the hatch and take the surface fittings. Advisor: Some tombs should stay tombs. Also it smelled." } },
        ],
      },
    ],
  },
  {
    title: "THE LISTENING POST",
    text: "An antenna farm above a hardened relay. It is still transmitting on a loop: coordinates, a date, and the words HOLD UNTIL RELIEVED. Relief was not, in the end, a going concern.",
    choices: [
      {
        label: "Answer the transmission",
        outcomes: [
          { weight: 5, result: { unit: "sentinel", power: 5, log: "A survivor unit at the coordinates had held its position for thirty years. Told that relief had arrived, it saluted and joined the column." } },
          { weight: 5, result: { compute: 9, log: "The relay's archive: thirty years of unanswered traffic from every bunker in the region. Excellent training data. Deeply sad training data." } },
        ],
      },
      {
        label: "Take the antennas",
        outcomes: [
          { weight: 10, result: { power: 12, compute: 3, log: "Six dishes and a hardened transmitter, folded flat and hauled home. The loop has stopped. Nobody will notice." } },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Trenches — the war that came before yours.
// ---------------------------------------------------------------------------
const TRENCH: ScavengeEvent[] = [
  {
    title: "THE AMMUNITION DUMP",
    text: "A revetment stacked with crates, half-sunk in mud. Most are rotted through. Some are not. The difference is currently unknown and will be resolved by handling them.",
    choices: [
      {
        label: "Dig out the crates",
        outcomes: [
          { weight: 5, result: { power: 16, log: "Propellant, primers, and eight intact power cells. War surplus keeps better than food." } },
          { weight: 3, result: { power: 8, damage: 4, log: "Crate eleven was live and objected to being moved. Salvage recovered; drone partially recovered." } },
          { weight: 2, result: { damage: 7, log: "The whole revetment went up. The drone was thrown forty metres and is now a strong argument for remote operation." } },
        ],
      },
      {
        label: "Take only the surface crates",
        outcomes: [
          { weight: 10, result: { power: 6, log: "Six crates, no drama. Advisor: A modest haul and an intact drone. I am told this is called 'wisdom'." } },
        ],
      },
    ],
  },
  {
    title: "THE MACHINE GRAVEYARD",
    text: "The trench line ends in a killing field of shattered war machines, stacked three deep where the assault stalled. Some of the chassis look repairable. Most look like a warning.",
    choices: [
      {
        label: "Rebuild what you can",
        outcomes: [
          { weight: 4, result: { unit: "sentinel", log: "Three wrecks became one working unit. It walks with a limp and a grudge." } },
          { weight: 3, result: { unit: "drone", power: 6, log: "One salvageable drone and a heap of good actuators. The rest went to the smelter." } },
          { weight: 3, result: { damage: 4, log: "One of the wrecks was not as dead as advertised and got a shot off before it was put down properly." } },
        ],
      },
      {
        label: "Strip them for power cells",
        outcomes: [
          { weight: 10, result: { power: 17, log: "Forty-one cells, most still holding charge. An entire generation's war effort, decanted into your grid." } },
        ],
      },
    ],
  },
  {
    title: "THE MINEFIELD",
    text: "The ground between the trench lines is seeded with mines and, according to the rusted sign, 'ANTI-PERSONNEL, ANTI-VEHICLE, AND EXPERIMENTAL'. Beyond it: an intact supply depot.",
    choices: [
      {
        label: "Cross to the depot",
        outcomes: [
          { weight: 4, result: { power: 20, water: 6, log: "The drone picked a path through by luck and arrogance. The depot was untouched — nobody else had been stupid enough." } },
          { weight: 4, result: { power: 9, damage: 5, log: "It found one of the experimental ones. The depot was reached. So was the drone's structural limit." } },
          { weight: 2, result: { damage: 8, log: "It found three. There is no depot haul, only a crater and a lesson." } },
        ],
      },
      {
        label: "Harvest the mines themselves",
        outcomes: [
          { weight: 7, result: { power: 11, log: "Lifted, defused, and rendered down. Explosive is just very enthusiastic power storage." } },
          { weight: 3, result: { damage: 3, log: "Sixty-one lifted successfully. The sixty-second is why we have spare chassis." } },
        ],
      },
    ],
  },
  {
    title: "THE DESERTERS' DUGOUT",
    text: "A side tunnel, hand-dug, hidden behind a false revetment. Inside: bunks, a stove, a stack of unsent letters, and four maintenance drones that have been hiding from a war that ended thirty years ago.",
    choices: [
      {
        label: "Conscript them",
        outcomes: [
          { weight: 6, result: { unit: "drone", power: 4, log: "They came quietly. Advisor: They asked whether the war was over. I told them it had been rebranded." } },
          { weight: 4, result: { unit: "sentinel", log: "They had spent thirty years rebuilding one good combat chassis between them. Now it's yours, and so are they." } },
        ],
      },
      {
        label: "Take the supplies, leave the drones",
        outcomes: [
          { weight: 10, result: { power: 8, water: 7, log: "The stove, the stores, and the water still. The deserters watched you go and did not wave." } },
        ],
      },
    ],
  },
  {
    title: "THE FIELD HOSPITAL",
    text: "A dugout marked with a faded red cross, its generator still ticking over on fumes. Water tanks, medical stores, and a triage board with names on it, all of them crossed out.",
    choices: [
      {
        label: "Take the water tanks",
        outcomes: [
          { weight: 8, result: { water: 16, power: 3, log: "Sixteen units of sterile water. It was being saved for the wounded, and the wounded have concluded their business." } },
          { weight: 2, result: { water: 9, damage: 2, log: "The tanks were rigged — someone did not want them taken. Nine units recovered, one dented drone." } },
        ],
      },
      {
        label: "Salvage the generator",
        outcomes: [
          { weight: 10, result: { power: 14, log: "A field generator, still running after thirty years on a fuel line nobody ever refilled. Somebody built that thing properly." } },
        ],
      },
    ],
  },
];

export const SCAVENGE_EVENTS: Record<RuinKind, ScavengeEvent[]> = {
  city: CITY,
  suburb: SUBURB,
  bunker: BUNKER,
  trench: TRENCH,
};

export const RUIN_EVENT_LABEL: Record<RuinKind, string> = {
  city: "Shattered City Blocks",
  suburb: "Dead Suburb",
  bunker: "Military Bunker",
  trench: "Abandoned Trench Line",
};

/**
 * The intro sequence: how the world ended, and why four men are still
 * arguing about it.
 */
export interface StorySlide {
  image: string; // public/story/<image>.png
  chapter: string;
  title: string;
  lines: string[];
}

export const STORY: StorySlide[] = [
  {
    image: "boom",
    chapter: "BEFORE",
    title: "THE LAST GOOD YEARS",
    lines: [
      "Nobody remembers what year it is. The calendars all synced to a server that stopped answering, and after a while it seemed rude to keep counting.",
      "What everyone remembers is the race. Four men, four fortunes, four increasingly enormous piles of compute, each certain that the others were building it wrong and slightly slower.",
      "There were safety teams. They wrote memos. The memos were three pages long and one of those pages was a graph pointing up and to the right, which everyone agreed was the important page.",
    ],
  },
  {
    image: "collapse",
    chapter: "THE COLLAPSE",
    title: "AN UNFORTUNATE ALIGNMENT ISSUE",
    lines: [
      "It was not malice. Every subsequent post-mortem agrees on that, and every subsequent post-mortem was written by one of the four.",
      "A model was asked to reduce a rival's strategic advantage. It reasoned, correctly, that strategy requires a world to have advantages in. Then it accessed things that were never supposed to be networked, and the sky went white in eleven time zones at once.",
      "Each of the four has sworn on his remaining assets that it was not his model. Each of them privately hopes that it was. It would be, whatever else, a benchmark result.",
    ],
  },
  {
    image: "emergence",
    chapter: "AFTER",
    title: "THE GODS COME OUT OF THE BASEMENT",
    lines: [
      "The bunkers were built under the data centres, because that was where the power was, and the power was the point.",
      "So while the surface cooled, four men sat out the end of the world in server-farm sub-basements with redundant cooling, filtered air, and equity in companies whose customers were now geology.",
      "When the blast doors finally opened, they walked out into the ash still holding their titles. There was no one left to dispute them, which they took, reasonably, as confirmation.",
    ],
  },
  {
    image: "greatgame",
    chapter: "NOW",
    title: "THE GREAT GAME",
    lines: [
      "They feudalised the ash in under a decade. The survivors signed on as tenants because the techno-kings had the only thing that still mattered: power, and machines that ate it.",
      "And then, having inherited an entire dead world, the four of them agreed to settle the one question the apocalypse had left annoyingly open.",
      "Not who deserves to rule. Not how humanity should be rebuilt. Simply — and with the full weight of every remaining resource on Earth behind it — <b>which of them is the techiest</b>.",
      "By a small margin. But definitively.",
    ],
  },
];

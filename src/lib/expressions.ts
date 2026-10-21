import type { Mood } from "./types";
export const EXPRESSION_PRESETS = [
  {
    id: "excited",
    label: "Excited",
    mood: "listening",
    description:
      "Starry eyes, a wide grin, and a barely-contained burst of excitement.",
  },
  {
    id: "proud",
    label: "Proud",
    mood: "listening",
    description: "Chin up, soft lids, and a very satisfied little smile.",
  },
  {
    id: "skeptical",
    label: "Skeptical",
    mood: "thinking",
    description: "One eyebrow says yes. The other is going to need convincing.",
  },
  {
    id: "embarrassed",
    label: "Embarrassed",
    mood: "listening",
    description: "Eyes averted, cheeks pink. Oh… you saw that?",
  },
  {
    id: "worried",
    label: "Worried",
    mood: "listening",
    description:
      "Pinched brows and a trembling mouth. A little reassurance, please.",
  },
  {
    id: "relieved",
    label: "Relieved",
    mood: "listening",
    description: "Eyes gently close as a long, quiet breath slips away.",
  },
  {
    id: "mischievous",
    label: "Mischievous",
    mood: "pointing",
    description:
      "A sideways glance and a cheeky grin. Definitely up to something.",
  },
  {
    id: "amazed",
    label: "Amazed",
    mood: "listening",
    description: "Huge eyes, tiny pupils, and one very round wow.",
  },
  {
    id: "confused",
    label: "Confused",
    mood: "thinking",
    description:
      "Uneven brows, a crooked mouth, and a question that won’t quite settle.",
  },
  {
    id: "disappointed",
    label: "Disappointed",
    mood: "listening",
    description: "Drooping eyelids and a falling tear. That wasn’t the plan.",
  },
  {
    id: "laughing",
    label: "Laughing",
    mood: "happy",
    description: "Eyes squeezed shut and a big, silent belly laugh.",
  },
  {
    id: "zen",
    label: "Zen",
    mood: "resting",
    description: "A slow breath, a soft smile, and nowhere else to be.",
  },
] as const satisfies readonly {
  id: string;
  label: string;
  mood: Mood;
  description: string;
}[];
export type NewExpression = (typeof EXPRESSION_PRESETS)[number]["id"];
export type Expression =
  | NewExpression
  | "wink"
  | "sad"
  | "alarmed"
  | "curious"
  | "determined"
  | "love";
export function isNewExpression(value: unknown): value is NewExpression {
  return EXPRESSION_PRESETS.some((preset) => preset.id === value);
}
/** Refresh live app faces without changing the seven compatible protocol moods. */
export function liveExpression(
  mood: Mood,
  selected?: Expression,
): Expression | undefined {
  if (selected) return selected;
  return (
    {
      listening: "proud",
      thinking: "confused",
      pointing: "proud",
      happy: "laughing",
      sleepy: "relieved",
      resting: "zen",
      talking: undefined,
    } as const
  )[mood];
}

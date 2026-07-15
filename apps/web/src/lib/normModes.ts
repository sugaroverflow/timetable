/**
 * The four heart-ranking normalisations (product feedback round 1), shared by
 * the Topic Feed sort control and the Analysis leaderboard switcher so their
 * labels and descriptions never drift. The math lives in
 * `@timetable/shared` (`topicNormScores`).
 */
export type NormKey = "raw" | "l2" | "l1" | "devotion";

export type NormMode = {
  key: NormKey;
  /** Compact formula shown in menus/toggles. */
  symbol: string;
  /** One-line gloss. */
  label: string;
  /** Full explanation for tooltips/help text. */
  description: string;
};

export const NORM_MODES: NormMode[] = [
  {
    key: "raw",
    symbol: "Σ❤️",
    label: "Total hearts",
    description: "No normalisation — every ❤️ counts equally (L∞).",
  },
  {
    key: "l2",
    symbol: "Σ❤️/√❤️",
    label: "Enthusiasm (L2)",
    description:
      "Enthusiasm discounted by the √ of each elector's total ❤️s (L2).",
  },
  {
    key: "l1",
    symbol: "Σ❤️/❤️",
    label: "One vote each (L1)",
    description:
      "Each elector has one unit of enthusiasm split across their ❤️s (L1).",
  },
  {
    key: "devotion",
    symbol: "(Σ❤️/❤️)/Σ❤️",
    label: "Average devotion",
    description:
      "The mean share of their ❤️s that this topic's supporters gave it (L1/L∞).",
  },
];

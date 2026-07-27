/**
 * The four heart-ranking normalisations (product feedback round 1), shared by
 * the All Topics sort control and the Analysis leaderboard switcher so their
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

/** The 💬 analogs (QA 2026-07-27), Analysis-only for now: elector comments
 * on published topics (never the topic's own host), aggregated per person
 * per topic since one person can 💬 a topic many times. Math:
 * `topicCommentScores` in @timetable/shared. */
export type CommentNormKey =
  | "c_raw"
  | "c_commenters"
  | "c_l2"
  | "c_l1"
  | "c_devotion";

export type CommentNormMode = Omit<NormMode, "key"> & { key: CommentNormKey };

export const COMMENT_NORM_MODES: CommentNormMode[] = [
  {
    key: "c_raw",
    symbol: "Σ💬",
    label: "Total comments",
    description:
      "No normalisation — every elector 💬 counts equally (a topic's own host never counts).",
  },
  {
    key: "c_commenters",
    symbol: "#💬",
    label: "Distinct commenters",
    description:
      "Each elector counts once per topic, however many 💬s they leave on it.",
  },
  {
    key: "c_l2",
    symbol: "Σ💬/√💬",
    label: "Chattiness-discounted (L2)",
    description:
      "Comments discounted by the √ of each elector's total 💬s (L2).",
  },
  {
    key: "c_l1",
    symbol: "Σ💬/💬",
    label: "Attention share (L1)",
    description:
      "Each elector has one unit of attention split across the topics they 💬 — one person can never contribute more than 1 (L1).",
  },
  {
    key: "c_devotion",
    symbol: "(Σ💬/💬)/#💬",
    label: "Average devotion",
    description:
      "The mean share of their 💬s that this topic's commenters gave it.",
  },
];

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

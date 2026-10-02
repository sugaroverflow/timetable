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

/** The 💙 analogs (host hearts, 2026-08-04), admin-only in Analysis: the
 * same four normalisations over host 💙s — "each host distributes one unit
 * of interest across the topics they 💙". Math: `computeHostHeartScores`
 * in @timetable/core over `topicNormScores`. */
export type HostHeartNormKey = "hh_raw" | "hh_l2" | "hh_l1" | "hh_devotion";

export type HostHeartNormMode = Omit<NormMode, "key"> & {
  key: HostHeartNormKey;
};

export const HOST_HEART_NORM_MODES: HostHeartNormMode[] = [
  {
    key: "hh_raw",
    symbol: "Σ💙",
    label: "Total 💙s",
    description: "No normalisation — every 💙 counts equally (L∞).",
  },
  {
    key: "hh_l2",
    symbol: "Σ💙/√💙",
    label: "Interest (L2)",
    description: "Interest discounted by the √ of each host's total 💙s (L2).",
  },
  {
    key: "hh_l1",
    symbol: "Σ💙/💙",
    label: "One unit each (L1)",
    description:
      "Each host has one unit of interest split across their 💙s (L1).",
  },
  {
    key: "hh_devotion",
    symbol: "(Σ💙/💙)/Σ💙",
    label: "Average devotion",
    description:
      "The mean share of their 💙s that this topic's 💙-ers gave it (L1/L∞).",
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

import { ImageResponse } from "next/og";

import { ogCard, OG_SIZE } from "@/lib/ogCard";

export const alt = "Topic";
export const size = OG_SIZE;
export const contentType = "image/png";

/** App-level social card — the one card that carries the Topic brand. */
export default function Image() {
  return new ImageResponse(
    ogCard({
      emoji: "📚",
      title: "Topic",
      footer: "Propose topics, discuss, and vote with ❤️",
    }),
    OG_SIZE,
  );
}

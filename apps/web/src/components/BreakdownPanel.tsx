"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { BreakdownTable } from "@/components/BreakdownTable";
import { clientGql } from "@/lib/clientGraphql";
import type { WeightedHeart } from "@/lib/feedTypes";

const QUERY = `query Breakdown($s: String!, $t: String!) {
  topicWeightedBreakdown(idOrSlug: $s, topicId: $t) {
    electorId electorName electorImage weight l2Weight devotionWeight heartedAt
  }
}`;

/** The per-elector ❤️ breakdown body, fetched on mount — mount it only
 * when its disclosure is open so a collapsed panel costs nothing. The
 * same table renders under feed cards and Analysis leaderboard rows. */
export function BreakdownPanelBody({
  slug,
  topicId,
  electorLabel = "Elector",
}: {
  slug: string;
  topicId: string;
  electorLabel?: string;
}) {
  const [rows, setRows] = useState<WeightedHeart[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    clientGql<{ topicWeightedBreakdown: WeightedHeart[] | null }>(QUERY, {
      s: slug,
      t: topicId,
    })
      .then((data) => {
        if (!cancelled) setRows(data.topicWeightedBreakdown ?? []);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, topicId]);

  if (failed) {
    return (
      <div className="faint" style={{ fontSize: 12 }}>
        Couldn&rsquo;t load the breakdown.
      </div>
    );
  }
  if (rows === null) {
    return (
      <div className="faint" style={{ fontSize: 12 }}>
        Loading…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="faint" style={{ fontSize: 12 }}>
        No ❤️ yet.
      </div>
    );
  }
  return <BreakdownTable slug={slug} rows={rows} electorLabel={electorLabel} />;
}

/** The triangle that opens a ❤️ breakdown — one look everywhere. */
export function BreakdownCaret({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="breakdown-caret"
      aria-expanded={open}
      aria-label={open ? "Hide ❤️ breakdown" : "Show ❤️ breakdown"}
      title={open ? "Hide ❤️ breakdown" : "Show ❤️ breakdown"}
      onClick={onToggle}
    >
      {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
    </button>
  );
}

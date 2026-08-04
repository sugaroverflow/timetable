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

const HOST_HEART_QUERY = `query HostHeartBreakdown($s: String!, $t: String!) {
  topicHostHeartBreakdown(idOrSlug: $s, topicId: $t) {
    hostId hostName hostImage weight l2Weight devotionWeight heartedAt
  }
}`;

type HostHeartBreakdownRow = {
  hostId: string;
  hostName: string | null;
  hostImage: string | null;
  weight: number;
  l2Weight: number;
  devotionWeight: number;
  heartedAt: string;
};

/** The per-host 💙 breakdown (host hearts, 2026-08-04) — the Analysis
 * table's dropdown when sorting by 💙. Admin eyes only (the API returns
 * null for anyone else). Reuses BreakdownTable by mapping hosts into its
 * elector-shaped rows. */
export function HostHeartBreakdownPanelBody({
  slug,
  topicId,
  hostLabel = "Host",
}: {
  slug: string;
  topicId: string;
  hostLabel?: string;
}) {
  const [rows, setRows] = useState<WeightedHeart[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    clientGql<{ topicHostHeartBreakdown: HostHeartBreakdownRow[] | null }>(
      HOST_HEART_QUERY,
      { s: slug, t: topicId },
    )
      .then((data) => {
        if (cancelled) return;
        setRows(
          (data.topicHostHeartBreakdown ?? []).map((r) => ({
            electorId: r.hostId,
            electorName: r.hostName,
            electorImage: r.hostImage,
            weight: r.weight,
            l2Weight: r.l2Weight,
            devotionWeight: r.devotionWeight,
            heartedAt: r.heartedAt,
          })),
        );
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
        No 💙 yet.
      </div>
    );
  }
  return <BreakdownTable slug={slug} rows={rows} electorLabel={hostLabel} />;
}

/** The triangle that opens a ❤️ breakdown — one look everywhere. `label`
 * covers the 💙 variants (host hearts, 2026-08-04). */
export function BreakdownCaret({
  open,
  onToggle,
  label = "❤️ breakdown",
}: {
  open: boolean;
  onToggle: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      className="breakdown-caret"
      aria-expanded={open}
      aria-label={open ? `Hide ${label}` : `Show ${label}`}
      title={open ? `Hide ${label}` : `Show ${label}`}
      onClick={onToggle}
    >
      {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
    </button>
  );
}

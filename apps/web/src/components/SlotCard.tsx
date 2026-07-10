import type { CalendarSlot, TopicOption } from "@/lib/calendarTypes";

import { AvailabilityControl } from "./AvailabilityControl";
import { SlotAdminControls } from "./SlotAdminControls";
import { SlotDiscussion } from "./SlotDiscussion";

export type CalendarPerms = {
  canSetAvailability: boolean;
  canSeeHostOnly: boolean;
  canAdmin: boolean;
};

function formatWeekday(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: "short" }).toUpperCase();
}
function formatDay(iso: string): string {
  return String(new Date(iso).getDate());
}
function formatMonth(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short" }).toUpperCase();
}
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function pct(n: number, total: number): string {
  return total > 0 ? `${(n / total) * 100}%` : "0%";
}

export function SlotCard({
  slot,
  slug,
  perms,
  topicOptions,
  adminLabel = "Admin",
}: {
  slot: CalendarSlot;
  slug: string;
  perms: CalendarPerms;
  topicOptions: TopicOption[];
  adminLabel?: string;
}) {
  const total = slot.counts.green + slot.counts.yellow + slot.counts.red;

  return (
    <li className="card stack">
      <div className="row wrap" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div className="row" style={{ gap: 14, alignItems: "flex-start" }}>
          <div className="slot-date">
            <div className="d-wd">{formatWeekday(slot.startsAt)}</div>
            <div className="d-day">{formatDay(slot.startsAt)}</div>
            <div className="d-mo">{formatMonth(slot.startsAt)}</div>
          </div>
          <div>
            <div className="slot-when">
              {formatTime(slot.startsAt)}–{formatTime(slot.endsAt)}
            </div>
            {slot.location ? (
              <div className="faint" style={{ fontSize: 13, marginTop: 3 }}>
                📍 {slot.location}
              </div>
            ) : null}
          </div>
        </div>
        {perms.canSetAvailability ? (
          <span
            className="stack"
            style={{ gap: "var(--space-1)", alignItems: "flex-end" }}
          >
            <span className="faint" style={{ fontSize: 11, fontWeight: 600 }}>
              Your availability
            </span>
            <AvailabilityControl slotId={slot.id} state={slot.viewerState} />
          </span>
        ) : null}
      </div>

      {slot.topics.length > 0 ? (
        <div className="row wrap">
          {slot.topics.map((t) => (
            <span key={t.id} className="pill pill-host">
              {t.title}
            </span>
          ))}
          {slot.topics.length > 1 ? (
            <span
              className="pill"
              style={{
                background: "var(--yellow-soft)",
                color: "var(--warning-ink)",
                borderColor: "transparent",
              }}
            >
              ⚠ conflict: {slot.topics.length} topics
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="row" style={{ gap: "var(--space-2)" }}>
        <span className="avail-bar" style={{ width: 160 }}>
          <span className="g" style={{ width: pct(slot.counts.green, total) }} />
          <span className="y" style={{ width: pct(slot.counts.yellow, total) }} />
          <span className="r" style={{ width: pct(slot.counts.red, total) }} />
        </span>
        <span className="faint" style={{ fontSize: 12 }}>
          {"\uD83D\uDFE2"} {slot.counts.green} · {"\uD83D\uDFE1"}{" "}
          {slot.counts.yellow} · {"\uD83D\uDD34"} {slot.counts.red}
        </span>
      </div>

      {perms.canSeeHostOnly && slot.perUser && slot.perUser.length > 0 ? (
        <div className="row wrap" style={{ gap: "var(--space-2)" }}>
          {slot.perUser.map((u) => (
            <span
              key={u.userId}
              className="row"
              style={{ gap: "var(--space-1)", fontSize: 12 }}
            >
              <span className={`dot ${u.state}`} /> {u.name ?? "?"}
            </span>
          ))}
        </div>
      ) : null}

      <SlotDiscussion
        slotId={slot.id}
        count={slot.commentCount}
        canPost={perms.canSeeHostOnly}
      />

      {perms.canAdmin ? (
        <SlotAdminControls
          slotId={slot.id}
          tags={slot.topics}
          topicOptions={topicOptions}
          label={adminLabel}
        />
      ) : null}
    </li>
  );
}

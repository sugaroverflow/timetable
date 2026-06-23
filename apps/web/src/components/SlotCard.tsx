import type { CalendarSlot, TopicOption } from "@/lib/calendarTypes";

import { AvailabilityControl } from "./AvailabilityControl";
import { SlotAdminControls } from "./SlotAdminControls";
import { SlotDiscussion } from "./SlotDiscussion";

export type CalendarPerms = {
  canSetAvailability: boolean;
  canSeeHostOnly: boolean;
  canAdmin: boolean;
};

function formatStart(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatEnd(iso: string): string {
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
}: {
  slot: CalendarSlot;
  slug: string;
  perms: CalendarPerms;
  topicOptions: TopicOption[];
}) {
  const total = slot.counts.green + slot.counts.yellow + slot.counts.red;

  return (
    <li className="card stack">
      <div className="row wrap" style={{ justifyContent: "space-between" }}>
        <div>
          <div className="slot-when">
            {formatStart(slot.startsAt)} – {formatEnd(slot.endsAt)}
          </div>
          <div className="faint" style={{ fontSize: 12 }}>
            {slot.location || "—"}
          </div>
        </div>
        {perms.canSetAvailability ? (
          <AvailabilityControl slotId={slot.id} state={slot.viewerState} />
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
                background: "var(--yellow-soft, #fdf2dc)",
                color: "#a9700f",
                borderColor: "transparent",
              }}
            >
              ⚠ conflict: {slot.topics.length} topics
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="row" style={{ gap: 8 }}>
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
        <div className="row wrap" style={{ gap: 8 }}>
          {slot.perUser.map((u) => (
            <span
              key={u.userId}
              className="row"
              style={{ gap: 4, fontSize: 12 }}
            >
              <span className={`dot ${u.state}`} /> {u.name ?? "?"}
            </span>
          ))}
        </div>
      ) : null}

      {perms.canSeeHostOnly ? (
        <SlotDiscussion slotId={slot.id} count={slot.commentCount} />
      ) : null}

      {perms.canAdmin ? (
        <SlotAdminControls
          slotId={slot.id}
          tags={slot.topics}
          topicOptions={topicOptions}
        />
      ) : null}
    </li>
  );
}

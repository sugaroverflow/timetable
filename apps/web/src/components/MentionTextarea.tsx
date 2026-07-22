"use client";

import { useRef, useState } from "react";

export type MentionCandidate = { name: string | null; slug: string | null };

// The in-progress "@handle" immediately before the caret, if any.
const ACTIVE_MENTION_RE = /(?:^|[^A-Za-z0-9_@])@([a-z0-9-]*)$/i;

/**
 * Textarea with an @mention autocomplete (product feedback round 1). Typing
 * "@" opens a member picker; selecting one inserts "@slug ". Purely a typing
 * aid — the server resolves handles independently, so a hand-typed @slug still
 * notifies.
 */
export function MentionTextarea({
  value,
  onChange,
  candidates,
  placeholder,
  ariaLabel,
  dataTopicComposer,
}: {
  value: string;
  onChange: (value: string) => void;
  candidates: MentionCandidate[];
  placeholder?: string;
  ariaLabel?: string;
  dataTopicComposer?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  const matches =
    query === null
      ? []
      : candidates
          .filter((c) => c.slug)
          .filter((c) => {
            if (query === "") return true;
            const q = query.toLowerCase();
            return (
              c.slug!.toLowerCase().includes(q) ||
              (c.name ?? "").toLowerCase().includes(q)
            );
          })
          .slice(0, 6);

  function refreshQuery(el: HTMLTextAreaElement) {
    const upto = el.value.slice(0, el.selectionStart ?? el.value.length);
    const m = ACTIVE_MENTION_RE.exec(upto);
    setQuery(m ? (m[1] ?? "") : null);
    setActive(0);
  }

  function pick(candidate: MentionCandidate) {
    const el = ref.current;
    if (!el || !candidate.slug) return;
    const caret = el.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const after = value.slice(caret);
    const replaced = before.replace(
      ACTIVE_MENTION_RE,
      (full, handle) =>
        full.slice(0, full.length - `@${handle}`.length) +
        `@${candidate.slug} `,
    );
    const next = replaced + after;
    onChange(next);
    setQuery(null);
    // Restore the caret just after the inserted handle.
    requestAnimationFrame(() => {
      el.focus();
      const pos = replaced.length;
      el.setSelectionRange(pos, pos);
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (query === null || matches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + matches.length) % matches.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      pick(matches[active]!);
    } else if (e.key === "Escape") {
      setQuery(null);
    }
  }

  return (
    <div className="mention-field">
      <textarea
        ref={ref}
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        data-topic-composer={dataTopicComposer}
        onChange={(e) => {
          onChange(e.target.value);
          refreshQuery(e.target);
        }}
        onKeyDown={onKeyDown}
        onClick={(e) => refreshQuery(e.currentTarget)}
        onBlur={() => setTimeout(() => setQuery(null), 120)}
      />
      {query !== null && matches.length > 0 ? (
        <ul className="mention-menu" role="listbox">
          {matches.map((c, i) => (
            <li key={c.slug}>
              <button
                type="button"
                className={
                  i === active ? "mention-option on" : "mention-option"
                }
                // Use onMouseDown so it fires before the textarea's blur.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(c);
                }}
              >
                <span className="mention-name">{c.name ?? c.slug}</span>
                <span className="mention-handle">@{c.slug}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

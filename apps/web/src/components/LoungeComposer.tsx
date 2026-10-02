"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

import { DraftRestoredNotice } from "@/components/DraftRestoredNotice";
import { RichTextEditor } from "@/components/RichTextEditor";
import { useStoredDraft } from "@/lib/formDrafts";
import { SUBMIT_SHORTCUT_ARIA } from "@/lib/submitShortcut";
import { useGqlAction } from "@/lib/useGqlAction";

const START = `mutation Start($s: String!, $body: String!) {
  startLoungeConversation(idOrSlug: $s, body: $body)
}`;

const EDIT = `mutation EditOpening($id: String!, $body: String!) {
  editLoungePost(commentId: $id, body: $body)
}`;

/** An empty rich-text document still serialises to whitespace. */
function isBlank(markdown: string): boolean {
  return markdown.replace(/[\s ]/g, "").length === 0;
}

/** On phones the composer is a full-screen sheet: hold the page still
 * under it (the same body lock as the mobile sidebar drawer). */
function useSheetScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (!window.matchMedia("(max-width: 640px)").matches) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}

/**
 * Starting a Lounge conversation (docs/host-lounge-plan.md 5a): a
 * deliberate, larger composer with the topic editor — opened by the "+"
 * beside the heading (desktop) or the floating "+" (phones, where it
 * becomes a full-screen sheet). Topic-length writing, so the draft
 * survives navigating away and reloads (topic-draft-recovery); posting or
 * Discard drops it, closing with ✕ or Escape keeps it.
 */
export function LoungeComposer({
  slug,
  hostLabel,
  onClose,
  onPosted,
}: {
  slug: string;
  hostLabel: string;
  onClose(): void;
  onPosted(): void;
}) {
  const { run, busy } = useGqlAction();
  const { values, patch, restored, discard } = useStoredDraft(
    `lounge-new:${slug}`,
    { body: "" },
  );
  useSheetScrollLock(true);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (isBlank(values.body)) return;
    void run(
      START,
      { s: slug, body: values.body },
      {
        success: "Conversation started",
        errorFallback: "Could not post",
        refresh: false,
        onSuccess: () => {
          discard();
          onPosted();
        },
      },
    );
  }

  return (
    <form
      className="lounge-composer card"
      onSubmit={submit}
      aria-label="Start a conversation"
    >
      <div className="lounge-composer-head">
        <h2 className="section-title">Start a conversation</h2>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onClose}
          aria-label="Close (your draft is kept)"
          title="Close — your draft is kept"
        >
          <X size={16} aria-hidden />
        </button>
      </div>
      {restored ? <DraftRestoredNotice onDiscard={discard} /> : null}
      <RichTextEditor
        submitOnShortcut
        value={values.body}
        onChange={(body) => patch({ body })}
        placeholder={`Share something with the ${hostLabel} Lounge…`}
        minHeight={180}
        uploadForum={slug}
      />
      <p className="hint" style={{ margin: 0 }}>
        Pictures you add can be opened by anyone who has their link — the Lounge
        keeps its words private, not its images.
      </p>
      <div className="row wrap lounge-composer-actions">
        <button
          className="btn btn-primary"
          type="submit"
          aria-keyshortcuts={SUBMIT_SHORTCUT_ARIA}
          disabled={busy || isBlank(values.body)}
        >
          {busy ? "Posting…" : "Post"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            discard();
            onClose();
          }}
          disabled={busy}
        >
          Discard
        </button>
      </div>
    </form>
  );
}

/** Editing a conversation's opening post: the same rich editor, swapped
 * in place of the post (edit-in-place, Ed's app-wide rule). */
export function LoungeOpeningEditor({
  slug,
  postId,
  initialBody,
  onDone,
  onSaved,
}: {
  /** The forum, for image uploads. */
  slug: string;
  postId: string;
  initialBody: string;
  onDone(): void;
  onSaved(): void;
}) {
  const { run, busy } = useGqlAction();
  const { values, patch, discard } = useStoredDraft(`lounge-post:${postId}`, {
    body: initialBody,
  });

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (isBlank(values.body)) return;
    void run(
      EDIT,
      { id: postId, body: values.body },
      {
        success: "Post updated",
        errorFallback: "Could not update post",
        refresh: false,
        onSuccess: () => {
          discard();
          onDone();
          onSaved();
        },
      },
    );
  }

  return (
    <form onSubmit={save} className="stack" style={{ gap: 8 }}>
      <RichTextEditor
        submitOnShortcut
        value={values.body}
        onChange={(body) => patch({ body })}
        minHeight={140}
        uploadForum={slug}
      />
      <div className="row wrap">
        <button
          className="btn btn-primary btn-sm"
          type="submit"
          aria-keyshortcuts={SUBMIT_SHORTCUT_ARIA}
          disabled={busy || isBlank(values.body)}
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            discard();
            onDone();
          }}
          disabled={busy}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

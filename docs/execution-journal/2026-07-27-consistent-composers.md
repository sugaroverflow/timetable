# 2026-07-27 - One writing surface: rich text for all longform composers

## What happened

Launch QA: longform composers were inconsistent — topic create/edit used
the TipTap rich text editor while the profile "About" and the admin
member-bio editor were small plain textareas labelled "markdown
supported". Confusing, and the bio boxes were only a few lines high.

Decision: **one editor, no toggle** — the rich text editor everywhere a
markdown-rendered longform field is edited, at the same size as the
topic composer (420px min-height). Markdown remains the stored format
(the TipTap Markdown extension round-trips it, and pasted markdown still
converts), so power users lose nothing and the server-side sanitizer
stays the safety boundary.

## Implementation

- `ProfileForm` (per-forum profile "About") — textarea → `RichTextEditor`,
  label simplified to "About".
- `MemberRolesEditor` (admin "Edit bio & photo" in Settings → Members) —
  textarea → `RichTextEditor`; the lazy-load state shows the editor
  shell (`.rte` with aria-busy) until the bio arrives.

## Deliberately unchanged

- Comment composers: shortform, and they carry the @mention
  autocomplete machinery (`MentionTextarea`) — different surface.
- Forum name/description (create form + settings): plain text fields —
  the description is never rendered as markdown.

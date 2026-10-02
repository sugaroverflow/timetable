"use client";

import { EmojiPicker } from "frimousse";

/**
 * The full emoji picker behind a Lounge react's "+" (Frimousse — unstyled,
 * so it wears our tokens; see `.emoji-picker` in globals.css). Its data is
 * served from our own origin (`public/emojibase`): the CSP's connect-src
 * would block Frimousse's default CDN, the same trap that took image
 * uploads down on 2026-08-18. Loaded lazily — most visits never open it.
 */
export default function LoungeEmojiPicker({
  onPick,
}: {
  onPick(emoji: string): void;
}) {
  return (
    <EmojiPicker.Root
      className="emoji-picker"
      emojibaseUrl="/emojibase"
      columns={8}
      onEmojiSelect={({ emoji }) => onPick(emoji)}
    >
      <EmojiPicker.Search
        className="emoji-picker-search"
        placeholder="Search emoji…"
        autoFocus
      />
      <EmojiPicker.Viewport className="emoji-picker-viewport">
        <EmojiPicker.Loading className="emoji-picker-note">
          Loading…
        </EmojiPicker.Loading>
        <EmojiPicker.Empty className="emoji-picker-note">
          No emoji found.
        </EmojiPicker.Empty>
        <EmojiPicker.List
          className="emoji-picker-list"
          components={{
            CategoryHeader: ({ category, ...props }) => (
              <div className="emoji-picker-category" {...props}>
                {category.label}
              </div>
            ),
            Emoji: ({ emoji, ...props }) => (
              <button className="emoji-picker-emoji" {...props}>
                {emoji.emoji}
              </button>
            ),
          }}
        />
      </EmojiPicker.Viewport>
    </EmojiPicker.Root>
  );
}

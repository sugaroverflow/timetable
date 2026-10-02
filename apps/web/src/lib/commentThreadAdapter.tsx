"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { FeedComment } from "@/lib/feedTypes";

/**
 * Which backend a comment thread writes to (the {host} Lounge,
 * 2026-09-30). The thread components — CommentList, CommentActions,
 * CommentEditForm, ChainTailComposer — are topic comments' by default;
 * the Lounge wraps its conversations in a provider that swaps in its own
 * mutations and render hooks, so both surfaces share ONE thread
 * implementation (the lesson of the calendar's two drifting row
 * implementations). Every mutation takes the same variables: `$id` (the
 * comment) plus `$body` / `$hidden` / `$pinned`.
 */
export type CommentThreadAdapter = {
  reply: string;
  edit: string;
  hide: string;
  remove: string;
  pin: string;
  /** "comment" / "post" — toasts and the delete confirmation. */
  noun: string;
  /** Hover text on the 📌. */
  pinTitle: string;
  /** false: don't router.refresh() after a write — `onChanged` reloads. */
  routerRefresh: boolean;
  onChanged?: () => void;
  /** Replaces the plain-text body (the Lounge's rich opening posts). */
  renderBody?: (comment: FeedComment) => ReactNode | undefined;
  /** Replaces the inline plain-text editor. */
  renderEditor?: (comment: FeedComment, onDone: () => void) => ReactNode;
  /** Under the bubble, above the actions (the Lounge's reacts). */
  renderFooter?: (comment: FeedComment) => ReactNode;
};

export const TOPIC_COMMENTS: CommentThreadAdapter = {
  reply: `mutation Reply($id: String!, $body: String!) {
  replyToComment(commentId: $id, body: $body) { id }
}`,
  edit: `mutation Edit($id: String!, $body: String!) {
  editComment(commentId: $id, body: $body) { id }
}`,
  hide: `mutation Hide($id: String!, $hidden: Boolean!) {
  hideComment(commentId: $id, hidden: $hidden) { id }
}`,
  remove: `mutation Delete($id: String!) {
  deleteComment(commentId: $id)
}`,
  pin: `mutation Pin($id: String!, $pinned: Boolean!) {
  pinComment(commentId: $id, pinned: $pinned) { id }
}`,
  noun: "comment",
  pinTitle: "Pinned by the topic's author",
  routerRefresh: true,
};

const Ctx = createContext<CommentThreadAdapter>(TOPIC_COMMENTS);

export function CommentThreadProvider({
  adapter,
  children,
}: {
  adapter: CommentThreadAdapter;
  children: ReactNode;
}) {
  return <Ctx.Provider value={adapter}>{children}</Ctx.Provider>;
}

export function useCommentThread(): CommentThreadAdapter {
  return useContext(Ctx);
}

/** Capitalised noun for toasts ("Comment hidden", "Post hidden"). */
export function nounTitle(adapter: CommentThreadAdapter): string {
  return adapter.noun.charAt(0).toUpperCase() + adapter.noun.slice(1);
}

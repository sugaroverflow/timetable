import type { FeedComment } from "@/lib/feedTypes";

/** The {host} Lounge's client-side shapes and pure helpers (2026-09-30). */

export type LoungeReaction = {
  emoji: string;
  count: number;
  names: string[];
  viewerReacted: boolean;
};

export type LoungePost = {
  id: string;
  parentId: string | null;
  authorId: string;
  authorName: string | null;
  authorImage: string | null;
  authorRoles: string[];
  body: string;
  /** Opening posts only: rendered + sanitised Markdown. */
  bodyHtml: string | null;
  hidden: boolean;
  deleted: boolean;
  editedAt: string | null;
  pinnedAt: string | null;
  createdAt: string;
  reactions: LoungeReaction[];
};

export type LoungeConversation = {
  id: string;
  lastActivityAt: string;
  root: LoungePost;
  replies: LoungePost[];
};

export type LoungePageData = {
  pinned: LoungeConversation[];
  conversations: LoungeConversation[];
  nextCursor: string | null;
  focused: LoungeConversation | null;
};

const POST_FIELDS = `id parentId authorId authorName authorImage authorRoles
  body bodyHtml hidden deleted editedAt pinnedAt createdAt
  reactions { emoji count names viewerReacted }`;

const CONVERSATION_FIELDS = `id lastActivityAt
  root { ${POST_FIELDS} }
  replies { ${POST_FIELDS} }`;

export const LOUNGE_QUERY = `query Lounge($s: String!, $cursor: String, $c: String) {
  lounge(idOrSlug: $s, cursor: $cursor, conversationId: $c) {
    pinned { ${CONVERSATION_FIELDS} }
    conversations { ${CONVERSATION_FIELDS} }
    nextCursor
    focused { ${CONVERSATION_FIELDS} }
  }
}`;

function toFeed(post: LoungePost): FeedComment {
  return {
    id: post.id,
    authorId: post.authorId,
    authorName: post.authorName,
    authorImage: post.authorImage,
    authorRoles: post.authorRoles,
    body: post.body,
    visibility: "public",
    hidden: post.hidden,
    deleted: post.deleted,
    editedAt: post.editedAt,
    pinnedAt: post.pinnedAt,
    createdAt: post.createdAt,
    replies: [],
  };
}

/** A conversation as ONE comment tree, for CommentList: the opening post
 * at the root, replies threaded by parentId in the order they arrive
 * (oldest first). A reply whose parent isn't here (hidden from this
 * viewer) hangs off the opening post rather than vanishing. */
export function conversationTree(conv: LoungeConversation): FeedComment {
  const root = toFeed(conv.root);
  const nodes = new Map<string, FeedComment>([[root.id, root]]);
  for (const r of conv.replies) nodes.set(r.id, toFeed(r));
  for (const r of conv.replies) {
    const node = nodes.get(r.id);
    if (!node) continue;
    const parent = (r.parentId && nodes.get(r.parentId)) || root;
    parent.replies.push(node);
  }
  return root;
}

/**
 * "Nothing moves while you're reading" (Ed, 2026-09-30). The server orders
 * conversations by bump — latest activity first — but a page that
 * reshuffled whenever someone replied would throw the reader around. So
 * the room keeps the order it first showed (`seen`), and only a
 * conversation it hasn't shown yet (just started, or newly bumped onto
 * the loaded pages) goes on top. A reload of the whole page re-sorts.
 *
 * Returns the display order of unpinned ids and the snapshot to keep.
 */
export function stableOrder(
  serverIds: string[],
  seen: string[],
): { order: string[]; seen: string[] } {
  const present = new Set(serverIds);
  const known = new Set(seen);
  const fresh = serverIds.filter((id) => !known.has(id));
  const kept = seen.filter((id) => present.has(id));
  const order = [...fresh, ...kept];
  return { order, seen: order };
}

"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CollapsibleTopicBody } from "@/components/CollapsibleTopicBody";
import { CommentList } from "@/components/CommentList";
import { EmptyState } from "@/components/EmptyState";
import {
  LoungeComposer,
  LoungeOpeningEditor,
} from "@/components/LoungeComposer";
import { LoungeReactions } from "@/components/LoungeReactions";
import { useToast } from "@/components/Toast";
import { clientGql } from "@/lib/clientGraphql";
import {
  CommentThreadProvider,
  type CommentThreadAdapter,
} from "@/lib/commentThreadAdapter";
import {
  conversationTree,
  LOUNGE_QUERY,
  stableOrder,
  type LoungeConversation,
  type LoungePageData,
  type LoungePost,
} from "@/lib/loungeThread";
import type { RoleLabels } from "@/lib/timetableSettings";

const MUTATIONS = {
  reply: `mutation Reply($id: String!, $body: String!) {
  replyInLounge(commentId: $id, body: $body)
}`,
  edit: `mutation Edit($id: String!, $body: String!) {
  editLoungePost(commentId: $id, body: $body)
}`,
  hide: `mutation Hide($id: String!, $hidden: Boolean!) {
  hideLoungePost(commentId: $id, hidden: $hidden)
}`,
  remove: `mutation Delete($id: String!) {
  deleteLoungePost(commentId: $id)
}`,
  pin: `mutation Pin($id: String!, $pinned: Boolean!) {
  pinLoungeConversation(commentId: $id, pinned: $pinned)
}`,
};

type Loaded = {
  pinned: LoungeConversation[];
  /** Every unpinned conversation on the loaded pages, server order. */
  list: LoungeConversation[];
  nextCursor: string | null;
  /** Pages fetched so far — a reload refetches as many. */
  pages: number;
  /** Display order of the unpinned conversations — see stableOrder. */
  order: string[];
};

/** A reload never fetches past this many pages, whatever it must cover. */
const MAX_RELOAD_PAGES = 25;

/** A reload that stopped short of the end (a cursor remains) can't prove a
 * missing conversation is gone — it may just lie past the pages fetched
 * (e.g. appended by a "Show older" that finished meanwhile) — so keep what
 * was showing. One that reached the end is authoritative. */
function keepUnfetched(
  next: Omit<Loaded, "order">,
  prev: Loaded,
): Omit<Loaded, "order"> {
  if (next.nextCursor === null) return next;
  const got = new Set(next.list.map((c) => c.id));
  return {
    ...next,
    list: [...next.list, ...prev.list.filter((c) => !got.has(c.id))],
    pages: Math.max(next.pages, prev.pages),
  };
}

async function fetchLoungePage(
  slug: string,
  cursor: string | null,
  focusId: string | null,
): Promise<LoungePageData> {
  const data: { lounge: LoungePageData | null } = await clientGql(
    LOUNGE_QUERY,
    { s: slug, cursor, c: focusId },
  );
  if (!data.lounge) throw new Error("The Lounge is closed");
  return data.lounge;
}

/** A page's conversations plus the linked one, when it isn't among them. */
function withFocused(page: LoungePageData): LoungeConversation[] {
  const list = [...page.conversations];
  if (page.focused && !list.some((c) => c.id === page.focused!.id)) {
    list.push(page.focused);
  }
  return list;
}

function needsMore(
  fetched: number,
  pages: number,
  list: LoungeConversation[],
  cover: Set<string>,
): boolean {
  if (fetched >= MAX_RELOAD_PAGES) return false;
  if (fetched < pages) return true;
  const got = new Set(list.map((c) => c.id));
  return [...cover].some((id) => !got.has(id));
}

/** Settle a fresh fetch into the order the reader has already seen. */
function arrange(next: Omit<Loaded, "order">, seen: string[]): Loaded {
  const pinned = new Set(next.pinned.map((c) => c.id));
  const ids = next.list.filter((c) => !pinned.has(c.id)).map((c) => c.id);
  return { ...next, order: stableOrder(ids, seen).order };
}

function fromFirstPage(page: LoungePageData): Loaded {
  const list = [...page.conversations];
  // A conversation linked from a digest or notification, older than the
  // first page: shown with the rest (on top, as the reader hasn't seen it).
  if (page.focused && !list.some((c) => c.id === page.focused!.id)) {
    list.unshift(page.focused);
  }
  return arrange(
    { pinned: page.pinned, list, nextCursor: page.nextCursor, pages: 1 },
    [],
  );
}

/** The room's data: the first page from the server, then its own
 * fetching — reload after a write (refetching as many pages as are
 * showing, then settling into the order already seen) and "Show older". */
function useLoungePages(
  slug: string,
  initial: LoungePageData,
  focusId: string | null,
) {
  const { toastError } = useToast();
  const [loaded, setLoaded] = useState<Loaded>(() => fromFirstPage(initial));
  const [loadingMore, setLoadingMore] = useState(false);
  // What's on screen now, for a reload to cover (read when it starts).
  const showing = useRef<string[]>(loaded.order);
  useEffect(() => {
    showing.current = loaded.order;
  }, [loaded.order]);

  const fetchPages = useCallback(
    async (
      pages: number,
      cover: Set<string>,
    ): Promise<Omit<Loaded, "order">> => {
      const first = await fetchLoungePage(slug, null, focusId);
      const list = withFocused(first);
      let cursor = first.nextCursor;
      let fetched = 1;
      // Keep going until every conversation on screen is re-fetched: a new
      // conversation above pushes the last one onto the next page, and it
      // must not vanish from under the reader.
      while (cursor && needsMore(fetched, pages, list, cover)) {
        const page = await fetchLoungePage(slug, cursor, null);
        list.push(...page.conversations);
        cursor = page.nextCursor;
        fetched += 1;
      }
      return { pinned: first.pinned, list, nextCursor: cursor, pages: fetched };
    },
    [slug, focusId],
  );

  const reload = useCallback(() => {
    fetchPages(loaded.pages, new Set(showing.current))
      .then((next) =>
        setLoaded((prev) => arrange(keepUnfetched(next, prev), prev.order)),
      )
      .catch((err: unknown) =>
        toastError(err instanceof Error ? err.message : "Could not reload"),
      );
  }, [fetchPages, loaded.pages, toastError]);

  async function showOlder() {
    if (!loaded.nextCursor) return;
    setLoadingMore(true);
    try {
      const data: { lounge: LoungePageData | null } = await clientGql(
        LOUNGE_QUERY,
        { s: slug, cursor: loaded.nextCursor, c: null },
      );
      if (!data.lounge) throw new Error("The Lounge is closed");
      const more = data.lounge;
      setLoaded((prev) => {
        const fresh = more.conversations.filter(
          (c) => !prev.list.some((p) => p.id === c.id),
        );
        // Older conversations go BELOW what's shown, never on top.
        return {
          ...prev,
          list: [...prev.list, ...fresh],
          nextCursor: more.nextCursor,
          pages: prev.pages + 1,
          order: [...prev.order, ...fresh.map((c) => c.id)],
        };
      });
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Could not load more");
    } finally {
      setLoadingMore(false);
    }
  }

  return { loaded, reload, showOlder, loadingMore };
}

/** The comment components, pointed at the Lounge: its mutations, its
 * rich opening posts and their editor, and reacts under every post. */
function useLoungeAdapter(
  slug: string,
  loaded: Loaded,
  reload: () => void,
): CommentThreadAdapter {
  // Posts by id, for the thread hooks (bodyHtml and reactions aren't on
  // the shared FeedComment shape).
  const posts = useMemo(() => {
    const map = new Map<string, LoungePost>();
    for (const c of [...loaded.pinned, ...loaded.list]) {
      map.set(c.root.id, c.root);
      for (const r of c.replies) map.set(r.id, r);
    }
    return map;
  }, [loaded]);

  return useMemo<CommentThreadAdapter>(
    () => ({
      ...MUTATIONS,
      noun: "post",
      pinTitle: "Pinned by an admin",
      routerRefresh: false,
      onChanged: reload,
      renderBody: (c) => {
        const post = posts.get(c.id);
        return post?.bodyHtml ? (
          <div className="lounge-opening">
            <CollapsibleTopicBody html={post.bodyHtml} />
          </div>
        ) : undefined;
      },
      renderEditor: (c, onDone) => {
        const post = posts.get(c.id);
        if (!post || post.parentId !== null) return undefined;
        return (
          <LoungeOpeningEditor
            slug={slug}
            postId={post.id}
            initialBody={post.body}
            onDone={onDone}
            onSaved={reload}
          />
        );
      },
      renderFooter: (c) => {
        const post = posts.get(c.id);
        if (!post) return null;
        return (
          <LoungeReactions
            postId={post.id}
            reactions={post.reactions}
            onChanged={reload}
          />
        );
      },
    }),
    [slug, posts, reload],
  );
}

/**
 * The {host} Lounge room (docs/host-lounge-plan.md): conversations in bump
 * order (pins first), each an opening post with its replies threaded by
 * the ordinary comment components, a "+" to start one, and "Show older"
 * paging. The room fetches for itself after every write rather than
 * refreshing the route: older pages live only here, and a reply or react
 * in one of them must update where the reader is looking.
 */
export function LoungeRoom({
  slug,
  initial,
  focusId,
  hostLabel,
  viewerId,
  isAdmin,
  roleLabels,
}: {
  slug: string;
  initial: LoungePageData;
  focusId: string | null;
  hostLabel: string;
  viewerId: string;
  isAdmin: boolean;
  roleLabels?: RoleLabels;
}) {
  const { loaded, reload, showOlder, loadingMore } = useLoungePages(
    slug,
    initial,
    focusId,
  );
  const adapter = useLoungeAdapter(slug, loaded, reload);
  const [composing, setComposing] = useState(false);
  const byId = new Map(loaded.list.map((c) => [c.id, c]));
  const ordered = loaded.order
    .map((id) => byId.get(id))
    .filter((c): c is LoungeConversation => c !== undefined);
  const empty = loaded.pinned.length === 0 && ordered.length === 0;

  function renderConversation(conv: LoungeConversation) {
    return (
      <article key={conv.id} className="card lounge-conversation">
        <CommentList
          comments={[conversationTree(conv)]}
          canReply
          canModerate={isAdmin}
          viewerId={viewerId}
          slug={slug}
          roleLabels={roleLabels}
          topicHref={`/f/${slug}/lounge?c=${conv.id}`}
          canPin={isAdmin}
        />
      </article>
    );
  }

  const title = `${hostLabel} Lounge`;
  return (
    <CommentThreadProvider adapter={adapter}>
      <div className={`stack lounge${composing ? " composing" : ""}`}>
        <div className="page-head lounge-head">
          <h2 className="page-title">{title}</h2>
          {composing ? null : (
            <button
              type="button"
              className="lounge-new"
              onClick={() => setComposing(true)}
              aria-label="Start a conversation"
              title="Start a conversation"
            >
              <Plus size={20} aria-hidden />
            </button>
          )}
        </div>

        {composing ? (
          <LoungeComposer
            slug={slug}
            hostLabel={hostLabel}
            onClose={() => setComposing(false)}
            onPosted={() => {
              setComposing(false);
              reload();
            }}
          />
        ) : null}

        {empty ? (
          <EmptyState
            icon="💬"
            title="No conversations yet"
            hint="Press + to start the first one."
          />
        ) : null}

        {loaded.pinned.map(renderConversation)}
        {ordered.map(renderConversation)}

        {loaded.nextCursor ? (
          <div className="row" style={{ justifyContent: "center" }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void showOlder()}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading…" : "Show older conversations"}
            </button>
          </div>
        ) : null}
      </div>

      {composing ? null : (
        <button
          type="button"
          className="lounge-fab"
          onClick={() => setComposing(true)}
          aria-label="Start a conversation"
        >
          <Plus size={24} aria-hidden />
        </button>
      )}
    </CommentThreadProvider>
  );
}

import { describe, expect, it } from "vitest";

import {
  conversationTree,
  stableOrder,
  type LoungeConversation,
  type LoungePost,
} from "./loungeThread";

const post = (id: string, parentId: string | null): LoungePost => ({
  id,
  parentId,
  authorId: "u",
  authorName: "U",
  authorImage: null,
  authorRoles: ["host"],
  body: id,
  bodyHtml: parentId ? null : `<p>${id}</p>`,
  hidden: false,
  deleted: false,
  editedAt: null,
  pinnedAt: null,
  createdAt: "2026-09-30T10:00:00.000Z",
  reactions: [],
});

describe("conversationTree", () => {
  it("threads replies under their parents, oldest first", () => {
    const conv: LoungeConversation = {
      id: "r",
      lastActivityAt: "2026-09-30T10:00:00.000Z",
      root: post("r", null),
      replies: [post("a", "r"), post("b", "r"), post("a1", "a")],
    };
    const tree = conversationTree(conv);
    expect(tree.id).toBe("r");
    expect(tree.replies.map((c) => c.id)).toEqual(["a", "b"]);
    expect(tree.replies[0]!.replies.map((c) => c.id)).toEqual(["a1"]);
  });

  it("hangs a reply with a missing parent off the opening post", () => {
    const conv: LoungeConversation = {
      id: "r",
      lastActivityAt: "2026-09-30T10:00:00.000Z",
      root: post("r", null),
      replies: [post("orphan", "hidden-parent")],
    };
    expect(conversationTree(conv).replies.map((c) => c.id)).toEqual(["orphan"]);
  });
});

describe("stableOrder — nothing moves while you're reading", () => {
  it("shows the server's bump order on first load", () => {
    expect(stableOrder(["c", "b", "a"], []).order).toEqual(["c", "b", "a"]);
  });

  it("keeps a bumped conversation where the reader saw it", () => {
    // "a" got a reply, so the server now puts it first.
    expect(stableOrder(["a", "c", "b"], ["c", "b", "a"]).order).toEqual([
      "c",
      "b",
      "a",
    ]);
  });

  it("puts conversations the reader hasn't seen on top", () => {
    expect(stableOrder(["new", "c", "b"], ["c", "b"]).order).toEqual([
      "new",
      "c",
      "b",
    ]);
  });

  it("drops conversations that are gone (deleted or hidden)", () => {
    expect(stableOrder(["c"], ["c", "b"]).order).toEqual(["c"]);
  });
});

import { describe, expect, it } from "vitest";

import type { FeedComment, ManagedTopic } from "./feedTypes";
import {
  latestCommentAt,
  MY_TOPICS_SORTS,
  normalizeManagedSort,
  PENDING_SORTS,
  sortManagedTopics,
} from "./managedTopicSort";

function comment(createdAt: string, replies: FeedComment[] = []): FeedComment {
  return {
    id: `c-${createdAt}`,
    authorId: "u1",
    authorName: null,
    authorImage: null,
    authorRoles: [],
    body: "hi",
    visibility: "public",
    hidden: false,
    deleted: false,
    editedAt: null,
    createdAt,
    replies,
  };
}

function topic(
  overrides: Partial<ManagedTopic> & { id: string },
): ManagedTopic {
  return {
    title: overrides.id,
    status: "submitted",
    bodyMd: "",
    bodyHtml: "",
    coverImageUrl: null,
    updatedAt: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

const ids = (topics: ManagedTopic[]) => topics.map((t) => t.id);

describe("normalizeManagedSort", () => {
  it("accepts values from the option list", () => {
    expect(normalizeManagedSort("status", MY_TOPICS_SORTS)).toBe("status");
    expect(normalizeManagedSort("comments", PENDING_SORTS)).toBe("comments");
  });

  it("falls back to updated for unknown or unlisted values", () => {
    expect(normalizeManagedSort(undefined, MY_TOPICS_SORTS)).toBe("updated");
    expect(normalizeManagedSort("hearts", MY_TOPICS_SORTS)).toBe("updated");
    // status is a My Topics sort, not a Pending Topics one
    expect(normalizeManagedSort("status", PENDING_SORTS)).toBe("updated");
  });
});

describe("latestCommentAt", () => {
  it("finds the newest timestamp across threads and nested replies", () => {
    const t = topic({
      id: "a",
      comments: [comment("2026-07-01T00:00:00Z")],
      adminComments: [
        comment("2026-07-02T00:00:00Z", [comment("2026-07-05T00:00:00Z")]),
      ],
    });
    expect(latestCommentAt(t)).toBe(Date.parse("2026-07-05T00:00:00Z"));
  });

  it("is zero when no threads are present", () => {
    expect(latestCommentAt(topic({ id: "a" }))).toBe(0);
  });
});

describe("sortManagedTopics", () => {
  it("sorts by updatedAt descending", () => {
    const sorted = sortManagedTopics(
      [
        topic({ id: "old", updatedAt: "2026-07-01T00:00:00Z" }),
        topic({ id: "new", updatedAt: "2026-07-10T00:00:00Z" }),
      ],
      "updated",
    );
    expect(ids(sorted)).toEqual(["new", "old"]);
  });

  it("sorts by latest comment, commentless topics last by updatedAt", () => {
    const sorted = sortManagedTopics(
      [
        topic({ id: "quiet-old", updatedAt: "2026-07-01T00:00:00Z" }),
        topic({ id: "quiet-new", updatedAt: "2026-07-12T00:00:00Z" }),
        topic({
          id: "discussed",
          adminComments: [comment("2026-07-08T00:00:00Z")],
        }),
        topic({
          id: "hot",
          adminComments: [comment("2026-07-11T00:00:00Z")],
        }),
      ],
      "comments",
    );
    expect(ids(sorted)).toEqual(["hot", "discussed", "quiet-new", "quiet-old"]);
  });

  it("groups by status (submitted first), newest updated within a group", () => {
    const sorted = sortManagedTopics(
      [
        topic({ id: "archived", status: "archived" }),
        topic({
          id: "pub-old",
          status: "published",
          updatedAt: "2026-07-01T00:00:00Z",
        }),
        topic({
          id: "pub-new",
          status: "published",
          updatedAt: "2026-07-09T00:00:00Z",
        }),
        topic({ id: "submitted", status: "submitted" }),
        topic({ id: "unpublished", status: "unpublished" }),
      ],
      "status",
    );
    expect(ids(sorted)).toEqual([
      "submitted",
      "pub-new",
      "pub-old",
      "unpublished",
      "archived",
    ]);
  });

  it("sorts by title A–Z", () => {
    const sorted = sortManagedTopics(
      [
        topic({ id: "b", title: "Birds" }),
        topic({ id: "a", title: "antelopes" }),
        topic({ id: "c", title: "Cats" }),
      ],
      "title",
    );
    expect(ids(sorted)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the input array", () => {
    const input = [
      topic({ id: "old", updatedAt: "2026-07-01T00:00:00Z" }),
      topic({ id: "new", updatedAt: "2026-07-10T00:00:00Z" }),
    ];
    sortManagedTopics(input, "updated");
    expect(ids(input)).toEqual(["old", "new"]);
  });
});

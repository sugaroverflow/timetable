// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  clientGql: vi.fn(),
  toast: vi.fn(),
  toastError: vi.fn(),
  search: "",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
  usePathname: () => "/f/spt/lounge",
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

vi.mock("@/lib/clientGraphql", () => ({
  clientGql: (...args: unknown[]) => mocks.clientGql(...args),
}));

vi.mock("@/components/Toast", () => ({
  useToast: () => ({ toast: mocks.toast, toastError: mocks.toastError }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { CommentList } from "@/components/CommentList";
import {
  CommentThreadProvider,
  TOPIC_COMMENTS,
  type CommentThreadAdapter,
} from "@/lib/commentThreadAdapter";
import type { FeedComment } from "@/lib/feedTypes";

function comment(
  id: string,
  authorId: string,
  replies: FeedComment[] = [],
): FeedComment {
  return {
    id,
    authorId,
    authorName: `Person ${authorId}`,
    authorImage: null,
    authorRoles: ["host"],
    body: `Body of ${id}`,
    visibility: "public",
    hidden: false,
    deleted: false,
    editedAt: null,
    pinnedAt: null,
    createdAt: "2026-10-01T10:00:00Z",
    replies,
  };
}

/** An opening post with two replies, one of which has a reply of its
 * own: a topic thread ends BOTH chains in a chain-tail composer. */
function tree(): FeedComment {
  return comment("root", "u1", [
    comment("a", "u2", [comment("b", "u1")]),
    comment("c", "u3"),
  ]);
}

/** The Lounge adapter's thread options (LoungeRoom sets these). */
const QUIET: CommentThreadAdapter = {
  ...TOPIC_COMMENTS,
  noun: "post",
  routerRefresh: false,
  variant: "quiet",
  footComposer: true,
};

function renderThread(adapter?: CommentThreadAdapter) {
  const list = (
    <CommentList
      comments={[tree()]}
      canReply
      canModerate={false}
      viewerId="u1"
      slug="spt"
      topicHref="/f/spt/lounge?c=root"
    />
  );
  return render(
    adapter ? (
      <CommentThreadProvider adapter={adapter}>{list}</CommentThreadProvider>
    ) : (
      list
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.search = "";
  mocks.clientGql.mockResolvedValue({ timetable: null });
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

describe("topic thread (unchanged)", () => {
  it("ends every chain in a chain-tail composer", () => {
    renderThread();
    expect(
      screen.getAllByRole("textbox", { name: "Continue this thread" }),
    ).toHaveLength(2);
    expect(
      screen.queryByRole("textbox", { name: "Reply to this conversation" }),
    ).toBeNull();
    // Today's action words, no ⋯ menu.
    expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Edit" }).length).toBe(2);
  });
});

describe("Lounge quiet thread", () => {
  it("renders ONE foot composer and no chain-tail composers", () => {
    renderThread(QUIET);
    expect(
      screen.queryAllByRole("textbox", { name: "Continue this thread" }),
    ).toHaveLength(0);
    expect(
      screen.getAllByRole("textbox", { name: "Reply to this conversation" }),
    ).toHaveLength(1);
    expect(screen.getByText("3 replies")).toBeTruthy();
  });

  it("keeps the nesting: a reply's reply sits in a nested .replies", () => {
    const { container } = renderThread(QUIET);
    const b = container.querySelector("#comment-b");
    expect(b?.parentElement?.classList.contains("replies")).toBe(true);
    expect(b?.closest("#comment-a")).not.toBeNull();
  });

  it("puts Edit and Delete behind ⋯ instead of action words", () => {
    renderThread(QUIET);
    // Own posts (root and b) get the menu; c is someone else's.
    expect(
      screen.getAllByRole("button", { name: "More actions" }),
    ).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("Reply on a reply opens its inline box", () => {
    const { container } = renderThread(QUIET);
    const replyOnC = container.querySelector(
      "#comment-c .lq-reply",
    ) as HTMLButtonElement;
    fireEvent.click(replyOnC);
    expect(screen.getAllByRole("textbox", { name: "Reply" })).toHaveLength(1);
  });

  it("Reply on the opening post focuses the foot box", () => {
    const { container } = renderThread(QUIET);
    fireEvent.click(
      container.querySelector("#comment-root .lq-reply") as HTMLButtonElement,
    );
    expect(screen.queryByRole("textbox", { name: "Reply" })).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Reply to this conversation" }),
    );
  });

  it("a ?reply= deep link to a reply opens its box, focused", async () => {
    mocks.search = "c=root&reply=c";
    renderThread(QUIET);
    const box = await screen.findByRole("textbox", { name: "Reply" });
    await waitFor(() => expect(document.activeElement).toBe(box));
  });

  it("a ?reply= deep link to the opening post focuses the foot box", async () => {
    mocks.search = "c=root&reply=root";
    renderThread(QUIET);
    const foot = screen.getByRole("textbox", {
      name: "Reply to this conversation",
    });
    await waitFor(() => expect(document.activeElement).toBe(foot));
    expect(screen.queryByRole("textbox", { name: "Reply" })).toBeNull();
  });
});

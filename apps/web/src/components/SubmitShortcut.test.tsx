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
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
  usePathname: () => "/f/spt/topics",
  useSearchParams: () => new URLSearchParams(""),
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
import { clearDraft, draftKey } from "@/lib/commentDrafts";
import type { FeedComment } from "@/lib/feedTypes";
import { submitFormFrom } from "@/lib/submitShortcut";

const PEOPLE = [
  { name: "Ada Host", slug: "ada", roles: ["host"], deactivatedAt: null },
];

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

/** The reply mutations sent so far, as [id, body] pairs. */
function replies(): [string, string][] {
  return mocks.clientGql.mock.calls
    .filter(([query]) => String(query).includes("mutation Reply"))
    .map(([, vars]) => {
      const v = vars as { id: string; body: string };
      return [v.id, v.body];
    });
}

/** A topic thread — a comment and one reply, so the reply carries the
 * Reply (fork) button — with that reply's inline Reply box opened. */
function openReplyBox(): HTMLTextAreaElement {
  render(
    <CommentList
      comments={[comment("c0", "u3", [comment("c1", "u2")])]}
      canReply
      canModerate={false}
      viewerId="u1"
      slug="spt"
      topicHref="/f/spt/t/x"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Reply" }));
  return screen.getByRole("textbox", { name: "Reply" }) as HTMLTextAreaElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.clientGql.mockImplementation(async (query: string) =>
    query.includes("MentionPeople")
      ? { timetablePeople: PEOPLE }
      : { reply: "new" },
  );
  Element.prototype.scrollIntoView = vi.fn();
  // Drafts outlive a composer by design (comment-draft-store), and an
  // unsent one reopens the box — so each test starts with none.
  clearDraft(draftKey.reply("c1"));
});

afterEach(cleanup);

/** submit-shortcut (#361): Ctrl/⌘+Enter presses the send button. */
describe("Ctrl/⌘+Enter in a reply box", () => {
  it("Ctrl+Enter posts the reply; plain Enter doesn't", async () => {
    const box = openReplyBox();
    fireEvent.change(box, { target: { value: "Agreed" } });

    fireEvent.keyDown(box, { key: "Enter" });
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(replies()).toEqual([]);

    fireEvent.keyDown(box, { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(replies()).toEqual([["c1", "Agreed"]]));
  });

  it("⌘+Enter posts too", async () => {
    const box = openReplyBox();
    fireEvent.change(box, { target: { value: "Yes" } });
    fireEvent.keyDown(box, { key: "Enter", metaKey: true });
    await waitFor(() => expect(replies()).toEqual([["c1", "Yes"]]));
  });

  it("empty text does nothing, as the button does", () => {
    const box = openReplyBox();
    fireEvent.change(box, { target: { value: "   " } });
    fireEvent.keyDown(box, { key: "Enter", ctrlKey: true });
    expect(replies()).toEqual([]);
  });

  it("never doubles an in-flight post", async () => {
    mocks.clientGql.mockImplementation(() => new Promise(() => {}));
    const box = openReplyBox();
    fireEvent.change(box, { target: { value: "Once" } });
    fireEvent.keyDown(box, { key: "Enter", ctrlKey: true });
    const send = box.form!.querySelector('[type="submit"]')!;
    await waitFor(() => expect(send).toHaveProperty("disabled", true));
    fireEvent.keyDown(box, { key: "Enter", ctrlKey: true });
    expect(replies()).toEqual([["c1", "Once"]]);
  });

  it("an IME composition never posts", () => {
    const box = openReplyBox();
    fireEvent.change(box, { target: { value: "日本" } });
    fireEvent.keyDown(box, { key: "Enter", ctrlKey: true, isComposing: true });
    expect(replies()).toEqual([]);
  });

  it("with the @mention picker open, plain Enter picks but Ctrl+Enter posts the text as typed", async () => {
    const box = openReplyBox();
    fireEvent.focus(box);
    await waitFor(() =>
      expect(
        mocks.clientGql.mock.calls.some(([q]) =>
          String(q).includes("MentionPeople"),
        ),
      ).toBe(true),
    );
    fireEvent.change(box, { target: { value: "hi @ad" } });
    await screen.findByRole("listbox");

    fireEvent.keyDown(box, { key: "Enter", ctrlKey: true });
    // Posted as typed — the half-typed handle is not auto-completed.
    await waitFor(() => expect(replies()).toEqual([["c1", "hi @ad"]]));
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("with the picker open, plain Enter still picks a person and doesn't post", async () => {
    const box = openReplyBox();
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "hi @ad" } });
    await screen.findByRole("listbox");
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(box.value).toBe("hi @ada "));
    expect(replies()).toEqual([]);
  });
});

describe("submitFormFrom", () => {
  function form(buttons: string) {
    const onSubmit = vi.fn((e: SubmitEvent) => e.preventDefault());
    document.body.innerHTML = `<form><textarea></textarea>${buttons}</form>`;
    document.querySelector("form")!.addEventListener("submit", onSubmit);
    return {
      onSubmit,
      ok: submitFormFrom(document.querySelector("textarea")),
    };
  }

  it("presses the form's one send button", () => {
    const { ok, onSubmit } = form(
      `<button type="submit">Send</button><button type="button">Cancel</button>`,
    );
    expect(ok).toBe(true);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("does nothing while that button is disabled", () => {
    const { ok, onSubmit } = form(
      `<button type="submit" disabled>Send</button>`,
    );
    expect(ok).toBe(false);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does nothing when the form has several submit actions", () => {
    const { ok, onSubmit } = form(
      `<button type="submit">A</button><button type="submit">B</button>`,
    );
    expect(ok).toBe(false);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

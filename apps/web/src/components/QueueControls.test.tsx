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

import { QueueControls } from "@/components/QueueControls";

/** The Topic Queue's arrow keys (queue-keys, 2026-09-07). Each arrow must
 * do exactly what its button does — and, just as important, stand down
 * when the keystroke isn't the queue's: a modifier belongs to the browser,
 * and anything typed in the composer belongs to the composer. */
function setup(props: Partial<Parameters<typeof QueueControls>[0]> = {}) {
  return render(
    <>
      <QueueControls
        topicId="t1"
        hearted={false}
        canHeart
        slug="spt"
        back={0}
        historyCount={0}
        {...props}
      />
      {/* The card's public composer, which ↓ goes looking for. */}
      <textarea data-topic-composer="t1" aria-label="Comment" />
    </>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.clientGql.mockResolvedValue({});
  // jsdom has no layout, so it doesn't implement this.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

describe("queue-keys", () => {
  it("← steps back through this round's history", () => {
    setup({ historyCount: 2 });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(mocks.push).toHaveBeenCalledWith("/f/spt/queue?back=1");
    expect(mocks.clientGql).not.toHaveBeenCalled();
  });

  it("← does nothing on the first card of a round", () => {
    setup({ historyCount: 0 });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("→ marks the topic seen and advances", async () => {
    setup();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(mocks.clientGql).toHaveBeenCalledWith(
      expect.stringContaining("queueMarkSeen"),
      { id: "t1" },
    );
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it("→ steps forward while looking back, marking nothing seen", () => {
    setup({ back: 1, historyCount: 2 });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(mocks.push).toHaveBeenCalledWith("/f/spt/queue");
    expect(mocks.clientGql).not.toHaveBeenCalled();
  });

  it("↑ toggles the ❤️ without advancing", async () => {
    setup();
    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(mocks.clientGql).toHaveBeenCalledWith(
      expect.stringContaining("heartTopic"),
      { id: "t1" },
    );
    await waitFor(() => expect(mocks.clientGql).toHaveBeenCalledTimes(1));
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("↑ is inert for a member without the gesture", () => {
    setup({ canHeart: false });
    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(mocks.clientGql).not.toHaveBeenCalled();
  });

  it("↓ puts the caret in the composer", async () => {
    setup();
    fireEvent.keyDown(window, { key: "ArrowDown" });
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText("Comment")),
    );
  });

  it("stands down while the member is typing", () => {
    setup({ historyCount: 2 });
    const box = screen.getByLabelText("Comment");
    fireEvent.keyDown(box, { key: "ArrowRight" });
    fireEvent.keyDown(box, { key: "ArrowLeft" });
    fireEvent.keyDown(box, { key: "ArrowUp" });
    expect(mocks.clientGql).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("leaves modified arrows to the browser", () => {
    setup({ historyCount: 2 });
    fireEvent.keyDown(window, { key: "ArrowLeft", metaKey: true });
    fireEvent.keyDown(window, { key: "ArrowRight", ctrlKey: true });
    fireEvent.keyDown(window, { key: "ArrowUp", altKey: true });
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.clientGql).not.toHaveBeenCalled();
  });

  it("drops the ❤️ hint from the legend without the gesture", () => {
    const { container } = setup({ canHeart: false });
    expect(container.textContent).toContain("comment");
    expect(container.textContent).not.toContain("❤️");
  });
});

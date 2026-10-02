// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clientGql: vi.fn(),
}));

vi.mock("@/lib/clientGraphql", () => ({
  clientGql: (...args: unknown[]) => mocks.clientGql(...args),
}));

import { ForumMentionTextarea } from "@/components/MentionTextarea";
import {
  CommentThreadProvider,
  TOPIC_COMMENTS,
} from "@/lib/commentThreadAdapter";

const PEOPLE = [
  { name: "Ada Host", slug: "ada", roles: ["host"], deactivatedAt: null },
  { name: "Bea Admin", slug: "bea", roles: ["admin"], deactivatedAt: null },
  { name: "Cy Elector", slug: "cy", roles: ["elector"], deactivatedAt: null },
  {
    name: "Dee Gone",
    slug: "dee",
    roles: ["host"],
    deactivatedAt: "2026-09-10T00:00:00.000Z",
  },
];

function Box() {
  const [value, setValue] = useState("");
  return (
    <ForumMentionTextarea
      mentionSlug="spt"
      value={value}
      onChange={setValue}
      ariaLabel="Reply"
    />
  );
}

/** Focus the box (which loads the people), then type "@" to open the
 * picker, and read back the handles it offers. */
async function offered(): Promise<string[]> {
  const box = screen.getByLabelText("Reply");
  fireEvent.focus(box);
  await waitFor(() => expect(mocks.clientGql).toHaveBeenCalled());
  fireEvent.change(box, { target: { value: "@" } });
  // The picker opens once the loaded people land.
  await screen.findByRole("listbox");
  return Array.from(document.querySelectorAll(".mention-handle")).map(
    (el) => el.textContent ?? "",
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.clientGql.mockResolvedValue({ timetablePeople: PEOPLE });
});

afterEach(cleanup);

describe("ForumMentionTextarea (reply @ picker)", () => {
  it("never offers a deactivated member", async () => {
    render(<Box />);
    expect(await offered()).toEqual(["@ada", "@bea", "@cy"]);
  });

  it("offers only the thread's mentionRoles where the adapter sets them (the Lounge)", async () => {
    render(
      <CommentThreadProvider
        adapter={{
          ...TOPIC_COMMENTS,
          mentionRoles: ["owner", "admin", "host"],
        }}
      >
        <Box />
      </CommentThreadProvider>,
    );
    expect(await offered()).toEqual(["@ada", "@bea"]);
  });
});

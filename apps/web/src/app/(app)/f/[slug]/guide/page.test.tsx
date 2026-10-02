// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  gqlFetch: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: () => mocks.auth() }));

vi.mock("@/lib/graphql", () => ({
  gqlFetch: (...args: unknown[]) => mocks.gqlFetch(...args),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
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

import GuidePage from "./page";

async function renderGuide(timetable: Record<string, unknown> | null) {
  mocks.auth.mockResolvedValue({ userId: "u1" });
  mocks.gqlFetch.mockResolvedValue({ timetable });
  return render(await GuidePage({ params: Promise.resolve({ slug: "spt" }) }));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** The How it works page (forum-guide, 2026-09-30) — the copy rules live
 * in lib/forumGuide.test.ts; this checks the page wires the forum's
 * roles, labels, and calendar state through and renders steps as links. */
describe("GuidePage", () => {
  it("renders the viewer's sections as numbered steps linking into the forum", async () => {
    await renderGuide({
      name: "Newspeak 2026",
      viewerRoles: ["elector"],
      settings: JSON.stringify({
        roleLabels: { elector: "Fellow" },
        calendar: { enabled: true },
      }),
      calendarHasSlots: true,
    });

    expect(
      screen.getByRole("heading", { name: "How Newspeak 2026 works" }),
    ).toBeTruthy();
    const section = screen.getByRole("region", { name: "For Fellows" });
    const links = within(section)
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(links).toEqual([
      "/f/spt/queue",
      "/f/spt/topics?hearted=me",
      "/f/spt/topics",
      "/f/spt/calendar",
    ]);
    expect(screen.queryByRole("region", { name: /Hosts/ })).toBeNull();
  });

  it("hides the calendar step while a non-admin's sidebar has no Calendar", async () => {
    await renderGuide({
      name: "Newspeak 2026",
      viewerRoles: ["elector"],
      settings: JSON.stringify({ calendar: { enabled: true } }),
      calendarHasSlots: false,
    });
    expect(screen.queryByRole("link", { name: /Calendar/ })).toBeNull();
  });

  it("404s a forum the viewer can't read", async () => {
    await expect(renderGuide(null)).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

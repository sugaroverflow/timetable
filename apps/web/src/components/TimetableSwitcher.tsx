"use client";

import { Menu } from "@base-ui/react/menu";
import { ChevronsUpDown, Plus } from "lucide-react";
import Link from "next/link";

import { privacyBadge } from "@/lib/timetableSettings";

export type SwitcherItem = {
  slug: string;
  name: string;
  iconUrl: string | null;
  /** Dark-mode alternative (2026-07-29); falls back to iconUrl. */
  iconDarkUrl?: string | null;
  iconEmoji?: string | null;
  privacy: string;
};

function ItemIcon({ item }: { item: SwitcherItem }) {
  if (item.iconEmoji) {
    return (
      <span className="tt-menu-icon tt-menu-icon-emoji" aria-hidden>
        {item.iconEmoji}
      </span>
    );
  }
  if (item.iconUrl) {
    // Both mode variants render; CSS shows the one matching html[data-theme]
    // (the pre-paint script always stamps a resolved light/dark value).
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={`tt-menu-icon${item.iconDarkUrl ? " mode-light-only" : ""}`}
          src={item.iconUrl}
          alt=""
        />
        {item.iconDarkUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="tt-menu-icon mode-dark-only"
            src={item.iconDarkUrl}
            alt=""
          />
        ) : null}
      </>
    );
  }
  return (
    <span className="tt-menu-icon tt-menu-icon-fallback" aria-hidden>
      {item.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/**
 * Timetable switcher in the sidebar footer (QA #59 — moved out of the
 * topbar, cf. the account switcher in Twitter's sidebar). Each entry shows
 * the forum's icon, name, and visibility; the menu opens upward and ends
 * with "New forum". Selecting one lands on its All Topics page.
 *
 * Base UI Menu handles open/close, outside-click, Escape, focus, and
 * roving-keyboard nav; navigation via Menu.Item(render=Link) auto-closes it.
 */
export function TimetableSwitcher({
  items,
  currentSlug,
}: {
  items: SwitcherItem[];
  currentSlug: string;
}) {
  const current = items.find((i) => i.slug === currentSlug) ?? null;

  return (
    <Menu.Root>
      <Menu.Trigger className="tt-switcher-trigger">
        {current ? <ItemIcon item={current} /> : null}
        <span className="tt-menu-name">{current?.name ?? "Forums"}</span>
        <ChevronsUpDown size={14} aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          className="tt-switcher-positioner"
          side="top"
          align="start"
          sideOffset={6}
        >
          <Menu.Popup className="tt-switcher-list">
            {items.map((item) => {
              const privacy = privacyBadge(item.privacy);
              return (
                <Menu.Item
                  key={item.slug}
                  className={`tt-menu-item${
                    item.slug === currentSlug ? " tt-menu-item-current" : ""
                  }`}
                  render={<Link href={`/f/${item.slug}/topics`} />}
                >
                  <ItemIcon item={item} />
                  <span>
                    {item.name}
                    <span className="tt-switcher-privacy">
                      <span
                        className="privacy-dot"
                        style={{ background: privacy.dot }}
                      />
                      {privacy.label}
                    </span>
                  </span>
                </Menu.Item>
              );
            })}
            <Menu.Item
              className="tt-menu-item tt-menu-new"
              render={<Link href="/timetables/new" />}
            >
              <span className="tt-menu-icon tt-menu-icon-fallback" aria-hidden>
                <Plus size={14} />
              </span>
              <span>New forum</span>
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

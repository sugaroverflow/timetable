"use client";

import { Menu } from "@base-ui/react/menu";
import { ChevronsUpDown, Plus } from "lucide-react";
import Link from "next/link";

import { privacyBadge } from "@/lib/timetableSettings";

export type SwitcherItem = {
  slug: string;
  name: string;
  iconUrl: string | null;
  privacy: string;
};

function ItemIcon({ item }: { item: SwitcherItem }) {
  if (item.iconUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="tt-menu-icon" src={item.iconUrl} alt="" />;
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
 * the timetable's icon, name, and visibility; the menu opens upward and
 * ends with "New timetable". Selecting one always lands on its feed.
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
        <span className="tt-menu-name">
          {current?.name ?? "Timetables"}
          <span className="tt-switcher-hint">Switch timetable</span>
        </span>
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
                  render={<Link href={`/t/${item.slug}/feed`} />}
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
              <span>New timetable</span>
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

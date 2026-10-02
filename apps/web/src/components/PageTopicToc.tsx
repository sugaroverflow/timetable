import Link from "next/link";

/**
 * page-topic-toc (Ed, 2026-08-17): the little table of contents under the
 * My Topics / ❤️ Topics page titles — the same quiet list the People
 * page's profile cards use for a member's topics, sitting bare on the
 * page background (no card). My Topics passes `#topic-<id>` anchors that
 * jump to the cards below; the ❤️/💙 pages pass permalinks (their feed
 * paginates, so a topic's card may not be rendered yet).
 */
export function PageTopicToc({
  items,
}: {
  items: { id: string; title: string; href: string | null }[];
}) {
  // One topic needs no map of itself.
  if (items.length < 2) return null;
  return (
    <nav className="person-topics page-topic-toc" aria-label="Topics listed">
      <ul>
        {items.map((t) => (
          <li key={t.id}>
            {t.href ? <Link href={t.href}>{t.title}</Link> : t.title}
          </li>
        ))}
      </ul>
    </nav>
  );
}

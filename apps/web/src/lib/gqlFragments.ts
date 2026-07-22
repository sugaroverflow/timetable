/** Shared GraphQL selection fragments for the web app's queries. */

export const COMMENT_FIELDS = `
  id parentId authorId authorName authorImage body visibility hidden createdAt
`;

/** Three-level comment selection (top level + two reply levels) — the
 * nesting depth the comment threads render. */
export function commentTree(field = "comments"): string {
  return `${field} { ${COMMENT_FIELDS} replies { ${COMMENT_FIELDS} replies { ${COMMENT_FIELDS} } } }`;
}

/** Topic selection shared by the feed (feedPage.ts) and the topic permalink
 * page — everything a TopicCard renders. The feed additionally selects
 * contentUpdatedAt for its "new since last visit" highlights. The per-elector
 * weightedBreakdown is deliberately NOT selected here: BreakdownToggle
 * fetches it lazily on first expand (it costs ~4 queries per topic). */
export const TOPIC_FEED_FIELDS = `
  id timetableId hostId hostName hostImage hostSlug title slug bodyMd bodyHtml coverImageUrl status
  heartCount weightedScore viewerHasHearted commentCount
  publishedAt createdAt
  ${commentTree()}
`;

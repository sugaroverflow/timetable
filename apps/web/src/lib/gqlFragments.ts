/** Shared GraphQL selection fragments for the web app's queries. */

const COMMENT_FIELDS = `
  id authorId authorName authorImage authorRoles body visibility hidden deleted editedAt createdAt
`;

/** How many comment levels every thread query selects (top level + seven
 * reply levels). Replies BELOW this depth exist server-side but are never
 * fetched, so CommentList refuses to offer Reply at the deepest level —
 * raising this constant must respect the API's query budget: the queue
 * page wraps the tree two fields deep, so its deepest scalar sits at
 * depth + 3 against GRAPHQL_MAX_DEPTH (12), and each level costs ~13
 * against GRAPHQL_MAX_COST (500) in every query that embeds the tree. */
export const COMMENT_TREE_DEPTH = 8;

/** Comment selection nested to {@link COMMENT_TREE_DEPTH} levels. */
export function commentTree(field = "comments"): string {
  let selection = COMMENT_FIELDS;
  for (let level = 1; level < COMMENT_TREE_DEPTH; level++) {
    selection = `${COMMENT_FIELDS} replies { ${selection} }`;
  }
  return `${field} { ${selection} }`;
}

/** ManagedTopic selection shared by My Topics and Pending Topics — the
 * superset (hostName/hostImage render only on the moderation queue's
 * cards, but sharing one fragment beats two drifting lists). */
export const MANAGED_TOPIC_FIELDS = `
  id title slug hostId hostSlug hostName hostImage status bodyMd bodyHtml coverImageUrl updatedAt readyAt
`;

/** Topic selection shared by the feed (feedPage.ts) and the topic permalink
 * page — everything a TopicCard renders. The feed additionally selects
 * contentUpdatedAt for its "new since last visit" highlights. The per-elector
 * weightedBreakdown is deliberately NOT selected here: BreakdownToggle
 * fetches it lazily on first expand (it costs ~4 queries per topic). */
export const TOPIC_FEED_FIELDS = `
  id hostId hostName hostImage hostSlug title slug bodyMd bodyHtml coverImageUrl status
  heartCount weightedScore viewerHasHearted commentCount viewerCommentsSeenAt
  viewerHasHostHearted hostHearters { userId name image slug }
  publishedAt createdAt
  ${commentTree()}
`;

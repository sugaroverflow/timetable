/** Conservative candidates for data-less alerts. Publication and current forum
 * membership are checked separately against the database at delivery time. */
export function pushTopicCandidates(
  items: readonly {
    topicId: string;
    visibility: string;
    createdAt: Date;
    kind: string;
  }[],
  since: Date,
  now: Date,
  calendarEnabled: boolean,
): string[] {
  return items
    .filter(
      (item) =>
        item.visibility === "public" &&
        item.createdAt > since &&
        item.createdAt <= now &&
        (calendarEnabled || !item.kind.startsWith("session_")),
    )
    .map((item) => item.topicId);
}

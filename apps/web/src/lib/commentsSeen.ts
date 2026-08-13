import { clientGql } from "@/lib/clientGraphql";

const MUTATION = `mutation($id: String!){ markCommentsSeen(topicId: $id) }`;

/** Fire-and-forget bump of the viewer's per-topic comments-seen watermark
 * (dialogue-first threading, 2026-08-13). Called on ENGAGEMENT — teaser
 * expand or permalink visit — never on feed scrolling. What was rendered
 * for the current visit is unaffected. */
export function markCommentsSeen(topicId: string): void {
  clientGql(MUTATION, { id: topicId }).catch(() => {
    // Non-fatal: the watermark just stays where it was.
  });
}

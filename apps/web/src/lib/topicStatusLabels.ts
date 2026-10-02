/**
 * The word people see for a topic's status.
 *
 * "submitted" reads as if the host had submitted the topic for review, but
 * nothing has been submitted and nothing is reviewed: a topic is created
 * straight into this state and sits there while its host writes it. The
 * host's actual "this is ready" signal is the separate readiness switch
 * (`readyAt`), which is what the admin Pending queue filters on - and that
 * queue has always called this state "still drafting". So the badge says
 * **draft** (Ed, 2026-08-21).
 *
 * The STORED status stays `submitted` - in the DB enum, the GraphQL API,
 * and every code identifier. Renaming a live enum value would be a
 * non-additive migration, which the term-time policy rules out
 * (`docs/OPERATIONS.md` R11), and it follows the house pattern from the
 * forum rebrand: user-visible strings change, identifiers don't.
 */
const TOPIC_STATUS_LABELS: Record<string, string> = {
  submitted: "draft",
  published: "published",
  unpublished: "unpublished",
  archived: "archived",
};

export function topicStatusLabel(status: string): string {
  return TOPIC_STATUS_LABELS[status] ?? status;
}

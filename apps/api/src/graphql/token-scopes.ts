import { getOperationAST, GraphQLError, Kind } from "graphql";
import type { Plugin } from "graphql-yoga";

import type { TokenScope } from "@timetable/shared";

import type { ApiContext } from "../context";

/**
 * Which scope each mutation needs when the request is authenticated by a
 * personal API token. Enforcement is DEFAULT-DENY: a mutation absent from this
 * map is unreachable by any token, whatever scopes it holds.
 *
 * That is the point, not an oversight. Everything deliberately left out is
 * either an admin/moderation power (moderateTopic, unpublishTopic,
 * reassignTopic, hideComment, hideSlotComment, updateForumProfile,
 * updateForumSettings, setHeartsCountFrom, updateMemberBio, queueRestartRound,
 * the timeslot and slot-session admin mutations, startUserPreview /
 * stopUserPreview) or token administration itself (createApiToken,
 * revokeApiToken — so a leaked token can neither mint more tokens nor widen
 * its own scopes). Adding a key here is a deliberate decision to expose that
 * mutation to scripts; the omissions are the security boundary.
 *
 * Scopes are a ceiling, never a grant — the resolvers' own role checks
 * (canHeart, assertMayComment, canModerate…) still run, so a token can only
 * ever do a subset of what its owner could do in the app.
 */
export const MUTATION_SCOPES: Readonly<Record<string, TokenScope>> = {
  // hearts:write
  heartTopic: "hearts:write",
  hostHeartTopic: "hearts:write",

  // comments:write — the author's own comments, on topics and on timeslots.
  addComment: "comments:write",
  replyToComment: "comments:write",
  editComment: "comments:write",
  deleteComment: "comments:write",
  addSlotComment: "comments:write",
  updateSlotComment: "comments:write",
  deleteSlotComment: "comments:write",

  // topics:write — a host's own topics.
  createTopic: "topics:write",
  updateTopic: "topics:write",
  submitTopic: "topics:write",
  setTopicReady: "topics:write",
  deleteTopic: "topics:write",

  // calendar:write — the member's own availability, plus proposing a slot.
  setAvailability: "calendar:write",
  setMyAvailabilityPattern: "calendar:write",
  proposeSlot: "calendar:write",

  // feed:write — clearing the member's own unread state.
  queueMarkSeen: "feed:write",
  markFeedSeen: "feed:write",
  markNotificationsSeen: "feed:write",

  // profile:write — the member's own profile and notification preferences.
  updateMyProfile: "profile:write",
  updateMyNotificationSettings: "profile:write",
  updateMyForumDigestSettings: "profile:write",
};

function forbidScope(field: string, scope: TokenScope | undefined): never {
  const detail = scope
    ? `this token doesn't have the "${scope}" scope`
    : "personal API tokens can't call it at all";
  throw new GraphQLError(`Not allowed: ${field} — ${detail}.`, {
    extensions: { code: "FORBIDDEN", requiredScope: scope ?? null },
  });
}

/**
 * Gate mutations by the authenticating token's scopes.
 *
 * Runs once per operation rather than per resolver, so no individual resolver
 * has to remember the check — and a mutation added later is denied to tokens
 * until someone deliberately maps it. Requests authenticated by a Clerk
 * session carry no `apiToken` and pass straight through.
 *
 * Modelled on the impersonation guard in app.ts: same `onExecute` hook, same
 * `getOperationAST` access to the document.
 */
export function useApiTokenScopes(): Plugin<ApiContext> {
  return {
    onExecute({ args }) {
      const ctx = args.contextValue;
      if (!ctx.apiToken) return;

      const operation = getOperationAST(args.document, args.operationName);
      if (operation?.operation !== "mutation") return;

      const granted = new Set<TokenScope>(ctx.apiToken.scopes);
      for (const selection of operation.selectionSet.selections) {
        // Mutations are always plain fields at the root; a fragment spread
        // there would hide the field name from this check, so refuse it
        // rather than guess.
        if (selection.kind !== Kind.FIELD) {
          throw new GraphQLError(
            "Not allowed: personal API tokens can't use fragments at the mutation root.",
            { extensions: { code: "FORBIDDEN" } },
          );
        }
        const field = selection.name.value;
        if (field.startsWith("__")) continue;
        const required = MUTATION_SCOPES[field];
        if (!required || !granted.has(required)) {
          forbidScope(field, required);
        }
      }
    },
  };
}

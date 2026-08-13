import { parse } from "graphql";
import { describe, expect, it } from "vitest";

import { API_TOKEN_SCOPES, type TokenScope } from "@timetable/shared";

import type { ApiContext } from "../context";

import { MUTATION_SCOPES, useApiTokenScopes } from "./token-scopes";

const plugin = useApiTokenScopes();

/** Drive the plugin's onExecute hook the way Yoga does. */
function execute(
  document: string,
  apiToken: ApiContext["apiToken"],
  operationName?: string,
) {
  const onExecute = plugin.onExecute;
  if (!onExecute) throw new Error("plugin has no onExecute hook");
  return onExecute({
    args: {
      document: parse(document),
      contextValue: { apiToken } as ApiContext,
      operationName,
    },
    // The hook only reads args; the rest of Yoga's payload is irrelevant here.
  } as unknown as Parameters<NonNullable<typeof onExecute>>[0]);
}

function token(...scopes: TokenScope[]): ApiContext["apiToken"] {
  return { id: "token-1", scopes };
}

const ALL_SCOPES = token(...API_TOKEN_SCOPES);

describe("useApiTokenScopes", () => {
  it("allows a mutation the token holds the scope for", () => {
    expect(() =>
      execute(
        `mutation { heartTopic(topicId: "t1") { hearted } }`,
        token("hearts:write"),
      ),
    ).not.toThrow();
  });

  it("denies a mutation whose scope is missing, naming the scope needed", () => {
    expect(() =>
      execute(
        `mutation { addComment(topicId: "t1", body: "hi") { id } }`,
        token("hearts:write"),
      ),
    ).toThrow(/comments:write/);
  });

  it("denies unmapped admin mutations even with every scope granted", () => {
    const adminMutations = [
      `mutation { moderateTopic(topicId: "t1", action: "publish") { id } }`,
      `mutation { unpublishTopic(topicId: "t1") { id } }`,
      `mutation { reassignTopic(topicId: "t1", hostId: "u2") { id } }`,
      `mutation { hideComment(commentId: "c1", hidden: true) { id } }`,
      `mutation { updateForumSettings(idOrSlug: "f") { id } }`,
      `mutation { updateForumProfile(idOrSlug: "f", privacy: "public") { id } }`,
      `mutation { updateMemberBio(idOrSlug: "f", userId: "u2", bio: "x") { name } }`,
      `mutation { setHeartsCountFrom(idOrSlug: "f", countFrom: "2026-01-01") { id } }`,
      `mutation { createTimeslots(idOrSlug: "f", slotsJson: "[]") { created } }`,
      `mutation { deleteTimeslot(slotId: "s1") }`,
      `mutation { queueRestartRound(idOrSlug: "f") }`,
      `mutation { startUserPreview(idOrSlug: "f", userId: "u2") }`,
    ];
    for (const document of adminMutations) {
      expect(() => execute(document, ALL_SCOPES)).toThrow(/Not allowed/);
    }
  });

  it("denies token administration, so a token can't mint or widen tokens", () => {
    expect(() =>
      execute(
        `mutation { createApiToken(name: "another", scopes: []) { secret } }`,
        ALL_SCOPES,
      ),
    ).toThrow(/Not allowed/);
    expect(() =>
      execute(`mutation { revokeApiToken(tokenId: "x") }`, ALL_SCOPES),
    ).toThrow(/Not allowed/);
  });

  it("denies a multi-field mutation if ANY field is out of scope", () => {
    expect(() =>
      execute(
        `mutation {
           heartTopic(topicId: "t1") { hearted }
           moderateTopic(topicId: "t1", action: "publish") { id }
         }`,
        token("hearts:write"),
      ),
    ).toThrow(/moderateTopic/);
  });

  it("refuses fragments at the mutation root rather than guessing the field", () => {
    expect(() =>
      execute(
        `mutation { ...Sneaky }
         fragment Sneaky on Mutation { moderateTopic(topicId: "t1", action: "publish") { id } }`,
        ALL_SCOPES,
      ),
    ).toThrow(/fragments/);
  });

  it("leaves queries alone — reading needs no scope", () => {
    expect(() =>
      execute(`query { topicFeed(idOrSlug: "f") { id } }`, token()),
    ).not.toThrow();
  });

  it("ignores session-authenticated requests entirely", () => {
    expect(() =>
      execute(
        `mutation { moderateTopic(topicId: "t1", action: "publish") { id } }`,
        null,
      ),
    ).not.toThrow();
  });

  it("checks the named operation when a document holds several", () => {
    const document = `
      mutation Heart { heartTopic(topicId: "t1") { hearted } }
      mutation Moderate { moderateTopic(topicId: "t1", action: "publish") { id } }
    `;
    expect(() =>
      execute(document, token("hearts:write"), "Heart"),
    ).not.toThrow();
    expect(() => execute(document, token("hearts:write"), "Moderate")).toThrow(
      /Not allowed/,
    );
  });

  it("maps every scope it references to a published scope", () => {
    for (const scope of Object.values(MUTATION_SCOPES)) {
      expect(API_TOKEN_SCOPES).toContain(scope);
    }
  });
});

import { parse } from "graphql";
import { describe, expect, it } from "vitest";

import { API_TOKEN_SCOPES, type TokenScope } from "@timetable/shared";

import type { ApiContext } from "../context";
import { createMemoryRateLimitStore } from "../http/rate-limit";

import {
  createTokenWriteLimiter,
  MUTATION_SCOPES,
  TOKEN_WRITE_LIMITS,
  TOKEN_WRITE_WINDOW_MS,
  useApiTokenScopes,
  useApiTokenWriteLimits,
} from "./token-scopes";

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

  it("lets a feed:write token clear comment-thread and digest unread state", () => {
    // Without these two, a feed-triage token can mark the queue seen but its
    // owner keeps receiving digests for comment threads already read.
    expect(() =>
      execute(
        `mutation {
           markCommentsSeen(topicId: "t1")
           markDigestRead(sendId: "d1")
         }`,
        token("feed:write"),
      ),
    ).not.toThrow();
    expect(() =>
      execute(`mutation { markCommentsSeen(topicId: "t1") }`, token()),
    ).toThrow(/feed:write/);
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

describe("useApiTokenWriteLimits", () => {
  /** A fresh plugin per test — memory store, so budgets can't bleed between
   * tests. Async because the limiter awaits its store. */
  function limitedExecute() {
    const plugin = useApiTokenWriteLimits(
      createTokenWriteLimiter(
        createMemoryRateLimitStore(TOKEN_WRITE_WINDOW_MS),
      ),
    );
    return async (
      document: string,
      apiToken: ApiContext["apiToken"],
      operationName?: string,
    ) => {
      const onExecute = plugin.onExecute;
      if (!onExecute) throw new Error("plugin has no onExecute hook");
      await onExecute({
        args: {
          document: parse(document),
          contextValue: { apiToken } as ApiContext,
          operationName,
        },
      } as unknown as Parameters<NonNullable<typeof onExecute>>[0]);
    };
  }

  const CREATE_TOPIC = `mutation { createTopic(idOrSlug: "f", title: "t") { id } }`;
  const HEART = `mutation { heartTopic(topicId: "t1") { hearted } }`;

  it("stops topic creation at its hourly budget, with the friendly error", async () => {
    const run = limitedExecute();
    for (let i = 0; i < TOKEN_WRITE_LIMITS.topics; i++) {
      await run(CREATE_TOPIC, token("topics:write"));
    }
    await expect(run(CREATE_TOPIC, token("topics:write"))).rejects.toThrow(
      /Rate limit for automated writes reached — try later/,
    );
  });

  it("gives ❤️ toggles their own, larger budget", async () => {
    const run = limitedExecute();
    for (let i = 0; i < TOKEN_WRITE_LIMITS.hearts; i++) {
      await run(HEART, token("hearts:write"));
    }
    await expect(run(HEART, token("hearts:write"))).rejects.toMatchObject({
      extensions: expect.objectContaining({ code: "RATE_LIMITED" }),
    });
  });

  it("pools every unlisted write into the shared `other` budget", async () => {
    const run = limitedExecute();
    for (let i = 0; i < TOKEN_WRITE_LIMITS.other; i++) {
      await run(
        `mutation { markFeedSeen(idOrSlug: "f") }`,
        token("feed:write"),
      );
    }
    // A DIFFERENT mutation is refused: `other` is one pool, not per field.
    await expect(
      run(`mutation { queueMarkSeen(idOrSlug: "f") }`, token("feed:write")),
    ).rejects.toThrow(/automated writes/);
  });

  it("budgets tokens independently of each other", async () => {
    const run = limitedExecute();
    for (let i = 0; i < TOKEN_WRITE_LIMITS.topics; i++) {
      await run(CREATE_TOPIC, token("topics:write"));
    }
    const other: ApiContext["apiToken"] = {
      id: "token-2",
      scopes: ["topics:write"],
    };
    await expect(run(CREATE_TOPIC, other)).resolves.toBeUndefined();
  });

  it("never touches session-authenticated requests or queries", async () => {
    const run = limitedExecute();
    for (let i = 0; i < TOKEN_WRITE_LIMITS.topics + 5; i++) {
      await run(CREATE_TOPIC, null);
    }
    for (let i = 0; i < 5; i++) {
      await run(`query { topicFeed(idOrSlug: "f") { id } }`, token());
    }
  });
});

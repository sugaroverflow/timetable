import { describe, expect, it } from "vitest";

import {
  PUSH_BODY_MAX,
  PUSH_EVENTLESS_KINDS,
  PUSH_KIND_DEFAULTS,
  PUSH_LABEL_MAX,
  PUSH_PAYLOAD_MAX_BYTES,
  PUSH_TITLE_MAX,
  isPushEventlessKind,
  isPushKindEnabled,
  isSafePushUrl,
  markdownToPlainText,
  normalizePushKeys,
  normalizePushLabel,
  pushBodyLine,
  pushTitle,
  pushUrgency,
  serializePushPayload,
  trimAtWord,
  utf8ByteLength,
} from "./push";
import { DIGEST_KINDS, type MembershipDigestSettings } from "./settings";

describe("PUSH_KIND_DEFAULTS", () => {
  it("covers every digest kind", () => {
    expect(Object.keys(PUSH_KIND_DEFAULTS).sort()).toEqual(
      [...DIGEST_KINDS].sort(),
    );
  });

  it("is on for things aimed at you and off for broadcast news (plan §1)", () => {
    const on = DIGEST_KINDS.filter((k) => PUSH_KIND_DEFAULTS[k]).sort();
    expect(on).toEqual(
      [
        "availabilityAsks",
        "comments",
        "lounge",
        "mentions",
        "replies",
        "sessions",
        "sessionsHostHearted",
      ].sort(),
    );
  });

  it("has exactly one eventless kind, drafts", () => {
    expect([...PUSH_EVENTLESS_KINDS]).toEqual(["drafts"]);
    expect(isPushEventlessKind("drafts")).toBe(true);
    expect(isPushEventlessKind("comments")).toBe(false);
  });
});

describe("isPushKindEnabled", () => {
  it("falls back to the push default for absent keys", () => {
    for (const kind of DIGEST_KINDS) {
      const expected = kind === "drafts" ? false : PUSH_KIND_DEFAULTS[kind];
      expect(isPushKindEnabled({}, kind)).toBe(expected);
      expect(isPushKindEnabled(null, kind)).toBe(expected);
      expect(isPushKindEnabled(undefined, kind)).toBe(expected);
    }
  });

  it("lets an explicit switch win either way", () => {
    expect(isPushKindEnabled({ replies: false }, "replies")).toBe(false);
    expect(isPushKindEnabled({ newTopics: true }, "newTopics")).toBe(true);
    // Neighbours keep their defaults.
    expect(isPushKindEnabled({ replies: false }, "mentions")).toBe(true);
  });

  it("never enables an eventless kind, whatever is stored", () => {
    expect(isPushKindEnabled({ drafts: true }, "drafts")).toBe(false);
  });

  it("reads the push field independently of the email kinds", () => {
    const settings: MembershipDigestSettings = {
      kinds: { replies: false, newTopics: true },
    };
    // Email switches never leak into push.
    expect(isPushKindEnabled(settings.push, "replies")).toBe(true);
    expect(isPushKindEnabled(settings.push, "newTopics")).toBe(false);
  });
});

describe("pushUrgency", () => {
  it("is high for aimed-at-you kinds and the sent-back notice", () => {
    expect(pushUrgency("replies")).toBe("high");
    expect(pushUrgency(null)).toBe("high");
  });
  it("is normal for broadcast kinds", () => {
    expect(pushUrgency("newTopics")).toBe("normal");
    expect(pushUrgency("hearts")).toBe("normal");
  });
});

describe("normalizePushKeys", () => {
  const p256dh = `B${"a".repeat(86)}`;
  const auth = "x".repeat(22);

  it("accepts browser keys and strips padding", () => {
    expect(normalizePushKeys(p256dh, auth)).toEqual({ p256dh, auth });
    expect(normalizePushKeys(`${p256dh}=`, `${auth}==`)).toEqual({
      p256dh,
      auth,
    });
  });

  it("rejects wrong lengths, alphabets and types", () => {
    expect(normalizePushKeys(p256dh.slice(1), auth)).toBeNull();
    expect(normalizePushKeys(`A${"a".repeat(86)}`, auth)).toBeNull();
    expect(normalizePushKeys(p256dh, "x".repeat(21))).toBeNull();
    expect(normalizePushKeys(p256dh, `${"x".repeat(21)}+`)).toBeNull();
    expect(normalizePushKeys(undefined, auth)).toBeNull();
    expect(normalizePushKeys(p256dh, 42)).toBeNull();
  });
});

describe("normalizePushLabel", () => {
  it("flattens, trims and caps", () => {
    expect(normalizePushLabel("  Chrome \n on Android ")).toBe(
      "Chrome on Android",
    );
    expect(
      Array.from(normalizePushLabel("word ".repeat(40)) ?? "").length,
    ).toBeLessThanOrEqual(PUSH_LABEL_MAX);
  });
  it("is null when empty or not a string", () => {
    expect(normalizePushLabel("   ")).toBeNull();
    expect(normalizePushLabel(undefined)).toBeNull();
  });
});

describe("trimAtWord", () => {
  it("leaves short text alone", () => {
    expect(trimAtWord("hello there", 20)).toBe("hello there");
  });

  it("cuts back to a word boundary and adds an ellipsis", () => {
    const out = trimAtWord("but we have infinitely nesting comments here", 32);
    expect(out).toBe("but we have infinitely nesting…");
    expect(Array.from(out).length).toBeLessThanOrEqual(32);
  });

  it("hard-cuts a single long word", () => {
    const out = trimAtWord("a".repeat(50), 10);
    expect(out).toBe(`${"a".repeat(9)}…`);
  });

  it("never splits an emoji", () => {
    const out = trimAtWord("❤️".repeat(30), 11);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });
});

describe("markdownToPlainText", () => {
  it("strips the syntax the editor stores", () => {
    expect(
      markdownToPlainText(
        "## Heading\n> quoted **bold** _it_ `code`\n- [a link](https://x) ![img](y)",
      ),
    ).toBe("Heading\nquoted bold it code\na link ");
  });
});

describe("pushBodyLine", () => {
  it("takes the first non-empty line", () => {
    expect(pushBodyLine("\n\n  first line  \nsecond")).toBe("first line");
  });

  it("trims to about PUSH_BODY_MAX characters", () => {
    const out = pushBodyLine("word ".repeat(60));
    expect(Array.from(out).length).toBeLessThanOrEqual(PUSH_BODY_MAX);
    expect(out.endsWith("…")).toBe(true);
  });

  it("strips Markdown when asked (Lounge opening posts, topic bodies)", () => {
    expect(
      pushBodyLine("![pic](u)\n\n# **Housing** policy", { markdown: true }),
    ).toBe("Housing policy");
    // Plain-text comments keep their characters.
    expect(pushBodyLine("2 * 3 = 6")).toBe("2 * 3 = 6");
  });

  it("is empty for a message with no text", () => {
    expect(pushBodyLine("![pic](u)", { markdown: true })).toBe("");
  });
});

describe("pushTitle", () => {
  it("reads who in where", () => {
    expect(pushTitle({ who: "Joshua Becker", where: "Faculty Lounge" })).toBe(
      "Joshua Becker in Faculty Lounge",
    );
  });
  it("adds the forum for people in more than one", () => {
    expect(
      pushTitle({
        who: "Ada",
        where: "Housing policy",
        forum: "Newspeak 2026",
      }),
    ).toBe("Ada in Housing policy · Newspeak 2026");
  });
  it("caps a pathological title", () => {
    expect(
      Array.from(pushTitle({ who: "Ada", where: "x ".repeat(200) })).length,
    ).toBeLessThanOrEqual(PUSH_TITLE_MAX);
  });
});

describe("isSafePushUrl", () => {
  it("accepts same-origin paths", () => {
    expect(isSafePushUrl("/f/newspeak/lounge?reply=abc")).toBe(true);
    expect(isSafePushUrl("/f/x/t/y?tab=comments#comment-1")).toBe(true);
  });
  it("rejects anything that could leave the site", () => {
    expect(isSafePushUrl("https://evil.example/")).toBe(false);
    expect(isSafePushUrl("//evil.example/")).toBe(false);
    expect(isSafePushUrl("/\\evil.example/")).toBe(false);
    expect(isSafePushUrl("javascript:alert(1)")).toBe(false);
    expect(isSafePushUrl("/ok\nbad")).toBe(false);
    expect(isSafePushUrl("")).toBe(false);
  });
});

describe("serializePushPayload", () => {
  const base = {
    title: "Joshua Becker in Faculty Lounge",
    body: "but we have infinitely nesting",
    url: "/f/newspeak/lounge?reply=1",
    tag: "lounge:1",
  };

  it("round-trips the four fields", () => {
    expect(JSON.parse(serializePushPayload(base) ?? "")).toEqual(base);
  });

  it("refuses an unsafe url", () => {
    expect(serializePushPayload({ ...base, url: "//evil" })).toBeNull();
  });

  it("trims title and body to their limits", () => {
    const json = serializePushPayload({
      ...base,
      title: "t ".repeat(200),
      body: "b ".repeat(200),
    });
    const parsed = JSON.parse(json ?? "") as { title: string; body: string };
    expect(Array.from(parsed.title).length).toBeLessThanOrEqual(PUSH_TITLE_MAX);
    expect(Array.from(parsed.body).length).toBeLessThanOrEqual(PUSH_BODY_MAX);
  });

  it("stays under the byte budget", () => {
    const json = serializePushPayload({
      ...base,
      title: "🦄".repeat(200),
      body: "🦄".repeat(200),
      url: `/${"a".repeat(1000)}`,
      tag: "t".repeat(500),
    });
    expect(json).not.toBeNull();
    expect(utf8ByteLength(json ?? "")).toBeLessThanOrEqual(
      PUSH_PAYLOAD_MAX_BYTES,
    );
  });
});

describe("utf8ByteLength", () => {
  it("counts UTF-8 bytes per code point", () => {
    expect(utf8ByteLength("abc")).toBe(3);
    expect(utf8ByteLength("é")).toBe(2);
    expect(utf8ByteLength("…")).toBe(3);
    expect(utf8ByteLength("🦄")).toBe(4);
  });
});

import type { UserDigest } from "@timetable/core";

const EMAIL_FROM = process.env.EMAIL_FROM ?? "Timetable <no-reply@example.com>";

/**
 * Send an email via Resend. With no RESEND_API_KEY (local dev), the message is
 * logged to the console instead.
 */
export async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(
      `\n[email] to=${args.to}\n[email] subject=${args.subject}\n${args.html}\n`,
    );
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: args.to,
      subject: args.subject,
      html: args.html,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend error ${res.status}: ${await res.text()}`);
  }
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );

/** Digest links use the first configured web origin as their base. */
const linkBase = (process.env.WEB_ORIGIN ?? "http://localhost:3000")
  .split(",")[0]!
  .trim()
  .replace(/\/$/, "");

const linked = (label: string, path: string | null): string =>
  path ? `<a href="${esc(`${linkBase}${path}`)}">${esc(label)}</a>` : esc(label);

export function renderDigest(digest: UserDigest): {
  subject: string;
  html: string;
} {
  const parts: string[] = [`<h2>Your Timetable digest</h2>`];

  if (digest.newTopics.length > 0) {
    parts.push("<h3>New topics</h3><ul>");
    for (const t of digest.newTopics) {
      parts.push(
        `<li>${linked(t.title, t.path)} <em>(${esc(t.timetableName)})</em></li>`,
      );
    }
    parts.push("</ul>");
  }

  if (digest.replies.length > 0) {
    parts.push("<h3>Replies to your comments</h3><ul>");
    for (const r of digest.replies) {
      parts.push(
        `<li><strong>${esc(r.by ?? "Someone")}</strong> on ${esc(
          r.topicTitle,
        )}: ${esc(r.snippet)}</li>`,
      );
    }
    parts.push("</ul>");
  }

  if (digest.hostActivity.length > 0) {
    parts.push("<h3>Activity on your topics</h3><ul>");
    for (const a of digest.hostActivity) {
      const label = a.kind === "heart" ? "new heart(s)" : "new comment(s)";
      parts.push(
        `<li>${linked(a.topicTitle, a.path)}: ${a.count} ${label}</li>`,
      );
    }
    parts.push("</ul>");
  }

  if (digest.assignedTopics.length > 0) {
    parts.push("<h3>You have a topic</h3><ul>");
    for (const a of digest.assignedTopics) {
      parts.push(
        `<li>${linked(a.topicTitle, a.path)} <em>(${esc(a.timetableName)})</em> was assigned to you</li>`,
      );
    }
    parts.push("</ul>");
  }

  return {
    subject: "Your Timetable digest",
    html: parts.join("\n"),
  };
}

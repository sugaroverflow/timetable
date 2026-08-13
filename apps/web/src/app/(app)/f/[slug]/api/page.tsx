import { ApiTokenPanel, type ApiTokenRow } from "@/components/ApiTokenPanel";
import { ExportDownloadButton } from "@/components/ExportDownloadButton";
import { env } from "@/env";
import { gqlFetch } from "@/lib/graphql";

const TOKENS_QUERY = `query {
  myApiTokens { id name prefix scopes createdAt lastUsedAt expiresAt revokedAt }
}`;

export default async function ApiPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Signed-out visitors read this page too (public forums) — they get the docs
  // without the token panel's data.
  const { myApiTokens } = await gqlFetch<{
    myApiTokens: ApiTokenRow[] | null;
  }>(TOKENS_QUERY).catch(() => ({ myApiTokens: null }));

  return (
    <div className="stack">
      <div className="page-head">
        <h2 className="page-title">API</h2>
        <p>
          Machine-readable access to this forum. Everything here returns exactly
          what the viewer&rsquo;s role can already see in the app.
        </p>
      </div>

      <section className="stack">
        <h3 className="section-title">Data export</h3>
        <p>
          The download is a timestamped JSON file. It contains the published
          topics with their body markdown, comments, heart counts, weighted
          scores, and the user ids currently hearting each topic; and member
          profiles. Hosts additionally receive their own topics in every status
          with comment threads. Admins additionally receive the pending
          (submitted) queue. The file&rsquo;s <code>readme</code> field
          describes its structure.
        </p>
        <ExportDownloadButton slug={slug} />
      </section>

      <section className="stack">
        <h3 className="section-title">GraphQL API</h3>
        <p>
          The endpoint is <code>{env.graphqlUrl}</code>. Read queries return the
          same role-filtered data as the app. The schema is discoverable via
          introspection. Forums with public privacy are readable without
          authentication.
        </p>
        <p>
          Requests authenticate with a bearer token: either the signed-in
          session&rsquo;s (what the app itself uses, refreshed every minute) or
          a personal token from the section below, which is what scripts and
          other clients want.
        </p>
      </section>

      <section className="stack">
        <h3 className="section-title">Personal tokens</h3>
        <p>
          A personal token is a long-lived credential that acts as you. Send it
          as <code>Authorization: Bearer tpk_…</code> to the GraphQL endpoint.
          Tokens are <strong>account-wide</strong> — a token carries your roles
          in every forum you belong to, not just this one.
        </p>
        <p>
          Every token can read whatever you can read. Writing is opt-in per
          token, and a token can only ever do a subset of what you can do in the
          app — the same role checks apply. Some things are off limits to every
          token no matter what you tick, and no matter your role: moderating or
          publishing topics, forum settings, member management and invites, and
          creating or revoking tokens. Those need a signed-in session. The REST
          endpoints (uploads, invites, the export above) do not accept personal
          tokens at all.
        </p>
        {myApiTokens ? (
          <ApiTokenPanel tokens={myApiTokens} />
        ) : (
          <p className="faint">Sign in to create a token.</p>
        )}
      </section>

      <section className="stack">
        <h3 className="section-title">Atom feed</h3>
        <p>
          The published topics are available as an Atom feed at{" "}
          <code>{`${env.apiUrl}/api/forums/${slug}/feed.atom`}</code> — the
          newest 50, with full topic bodies, no authentication. The feed exists
          only while the forum is readable without signing in; feed readers also
          discover it automatically from any forum page.
        </p>
      </section>

      <section className="stack">
        <h3 className="section-title">Planned</h3>
        <ul className="list">
          <li>An MCP server.</li>
        </ul>
      </section>
    </div>
  );
}

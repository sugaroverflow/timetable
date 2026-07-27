import { ExportDownloadButton } from "@/components/ExportDownloadButton";
import { env } from "@/env";

export default async function ApiPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <div className="stack">
      <div className="page-head">
        <h2 className="section-title">API</h2>
        <p>
          Machine-readable access to this forum. Everything here returns exactly
          what the viewer&rsquo;s role can already see in the app.
        </p>
      </div>

      <section className="stack">
        <h3 className="people-heading">Data export</h3>
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
        <h3 className="people-heading">GraphQL API</h3>
        <p>
          The endpoint is <code>{env.graphqlUrl}</code>. Read queries return the
          same role-filtered data as the app. The schema is discoverable via
          introspection. Requests authenticate with the signed-in
          session&rsquo;s bearer token. Forums with public privacy are readable
          without authentication.
        </p>
      </section>

      <section className="stack">
        <h3 className="people-heading">Atom feed</h3>
        <p>
          The published topics are available as an Atom feed at{" "}
          <code>{`${env.apiUrl}/api/timetables/${slug}/feed.atom`}</code> — the
          newest 50, with full topic bodies, no authentication. The feed exists
          only while the forum is readable without signing in; feed readers also
          discover it automatically from any forum page.
        </p>
      </section>

      <section className="stack">
        <h3 className="people-heading">Planned</h3>
        <ul className="list">
          <li>Personal API tokens (read-only).</li>
          <li>An MCP server.</li>
        </ul>
      </section>
    </div>
  );
}

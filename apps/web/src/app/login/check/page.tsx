export default function CheckEmailPage() {
  return (
    <main className="container" style={{ maxWidth: 440 }}>
      <div className="card">
        <h1 style={{ marginTop: 0, fontSize: 22 }}>Check your email</h1>
        <p className="muted">
          A sign-in link is on its way. Click it to finish signing in.
        </p>
        <p className="faint" style={{ fontSize: 13 }}>
          In local development without an email provider configured, the link is
          printed to the web server console.
        </p>
      </div>
    </main>
  );
}

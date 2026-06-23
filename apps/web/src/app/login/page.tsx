import Link from "next/link";

import { sendMagicLink } from "./actions";

export default function LoginPage() {
  return (
    <main className="container" style={{ maxWidth: 440 }}>
      <Link className="brand" href="/" style={{ marginBottom: 24 }}>
        <span className="mark">T</span>
        <span>Timetable</span>
      </Link>

      <div className="card">
        <h1 style={{ marginTop: 0, fontSize: 22 }}>Sign in</h1>
        <p className="muted">
          Enter your email and we&rsquo;ll send you a magic link.
        </p>
        <form action={sendMagicLink}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
          </div>
          <button className="btn btn-primary" type="submit">
            Send magic link
          </button>
        </form>
      </div>
    </main>
  );
}

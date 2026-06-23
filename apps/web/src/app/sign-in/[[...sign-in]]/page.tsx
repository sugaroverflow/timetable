import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="container auth-page">
      <div className="auth-fallback">
        <h1>Sign in</h1>
        <p>
          If this stays blank, authenticate this browser with the Clerk
          development instance and allow <code>http://localhost:3000</code> in
          Clerk.
        </p>
      </div>
      <SignIn
        path="/sign-in"
        routing="path"
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/timetables"
      />
    </main>
  );
}

import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="container auth-page">
      <div className="auth-fallback">
        <h1>Create account</h1>
        <p>
          If this stays blank, authenticate this browser with the Clerk
          development instance and allow <code>http://localhost:3000</code> in
          Clerk.
        </p>
      </div>
      <SignUp
        path="/sign-up"
        routing="path"
        signInUrl="/sign-in"
        fallbackRedirectUrl="/timetables"
      />
    </main>
  );
}

import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="container auth-page">
      <div className="auth-fallback">
        <h1>Create account</h1>
        <p>Create an account to create and join timetables.</p>
      </div>
      {process.env.E2E_TEST_MODE === "1" ? null : (
        <SignUp
          path="/sign-up"
          routing="path"
          signInUrl="/sign-in"
          fallbackRedirectUrl="/timetables"
        />
      )}
    </main>
  );
}

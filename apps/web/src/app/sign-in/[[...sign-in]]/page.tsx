import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="container auth-page">
      <div className="auth-fallback">
        <h1>Sign in</h1>
        <p>Continue with your account to access your timetables.</p>
      </div>
      {process.env.E2E_TEST_MODE === "1" ? null : (
        <SignIn
          path="/sign-in"
          routing="path"
          signUpUrl="/sign-up"
          fallbackRedirectUrl="/timetables"
        />
      )}
    </main>
  );
}

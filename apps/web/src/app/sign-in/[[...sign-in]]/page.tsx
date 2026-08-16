import { SignIn } from "@clerk/nextjs";

import { e2eTestMode } from "@/env";

export default function SignInPage() {
  return (
    <main className="container auth-page">
      <div className="auth-fallback">
        <h1>Sign in</h1>
        <p>Continue with your account to access your forums.</p>
      </div>
      {e2eTestMode ? null : (
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

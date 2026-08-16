import { SignUp } from "@clerk/nextjs";

import { e2eTestMode } from "@/env";

export default function SignUpPage() {
  return (
    <main className="container auth-page">
      <div className="auth-fallback">
        <h1>Create account</h1>
        <p>Create an account to create and join forums.</p>
      </div>
      {e2eTestMode ? null : (
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

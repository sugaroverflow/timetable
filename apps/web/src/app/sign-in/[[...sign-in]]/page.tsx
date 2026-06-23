import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="container" style={{ display: "grid", placeItems: "center" }}>
      <SignIn />
    </main>
  );
}

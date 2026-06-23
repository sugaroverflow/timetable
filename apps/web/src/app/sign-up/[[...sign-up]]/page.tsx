import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="container" style={{ display: "grid", placeItems: "center" }}>
      <SignUp />
    </main>
  );
}

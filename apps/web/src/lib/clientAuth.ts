type ClerkGlobal = {
  session?: { getToken: () => Promise<string | null> };
  load?: () => Promise<void>;
};

/** Read the current Clerk session token in the browser (null when signed out). */
export async function getClerkToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const clerk = (window as unknown as { Clerk?: ClerkGlobal }).Clerk;
  if (!clerk?.session) return null;
  try {
    return await clerk.session.getToken();
  } catch {
    return null;
  }
}

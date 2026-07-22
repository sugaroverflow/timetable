type ClerkGlobal = {
  loaded?: boolean;
  session?: { getToken: () => Promise<string | null> };
  load?: () => Promise<void>;
};

function clerkGlobal(): ClerkGlobal | undefined {
  return (window as unknown as { Clerk?: ClerkGlobal }).Clerk;
}

/**
 * Wait for the Clerk browser bundle to initialize. Without this, mutations
 * fired right after page load see no session and fail as unauthenticated.
 */
async function waitForClerk(
  timeoutMs = 5000,
): Promise<ClerkGlobal | undefined> {
  const deadline = Date.now() + timeoutMs;
  let clerk = clerkGlobal();
  while (
    (!clerk || (!clerk.loaded && !clerk.session)) &&
    Date.now() < deadline
  ) {
    await new Promise((r) => setTimeout(r, 100));
    clerk = clerkGlobal();
  }
  return clerk;
}

/** Read the current Clerk session token in the browser (null when signed out). */
export async function getClerkToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const clerk = await waitForClerk();
  if (!clerk?.session) return null;
  try {
    return await clerk.session.getToken();
  } catch {
    return null;
  }
}

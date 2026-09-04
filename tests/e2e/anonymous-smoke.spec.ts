import { expect, type Page, test } from "@playwright/test";

async function goto(path: string, page: Page) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
}

test.describe("anonymous web smoke", () => {
  test("renders the public home page with auth links", async ({ page }) => {
    await goto("/", page);

    await expect(page.getByText("Topic", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Create account" }),
    ).toBeVisible();
  });

  test("renders the sign-in shell instead of a blank page", async ({
    page,
  }) => {
    await goto("/sign-in", page);

    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(
      page.getByText("Continue with your account to access your forums."),
    ).toBeVisible();
    await expect(page.locator("main")).toBeVisible();
  });

  test("renders the sign-up shell instead of a blank page", async ({
    page,
  }) => {
    await goto("/sign-up", page);

    await expect(
      page.getByRole("heading", { name: "Create account" }),
    ).toBeVisible();
    await expect(
      page.getByText("Create an account to create and join forums."),
    ).toBeVisible();
    await expect(page.locator("main")).toBeVisible();
  });

  // vanity-address: a request on a host that isn't ours never renders the
  // app under that name — it is sent home (here the API is absent, so no
  // host has routes and the redirect target is the origin's root).
  test("redirects an unknown host home instead of serving in place", async ({
    request,
  }) => {
    const res = await request.get("/2026/topics", {
      headers: { "x-forwarded-host": "vanity.example.test" },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(307);
    const location = res.headers()["location"] ?? "";
    expect(location.endsWith("/")).toBe(true);
    expect(location.startsWith("http")).toBe(true);
    expect(location).not.toContain("vanity.example.test");
  });
});

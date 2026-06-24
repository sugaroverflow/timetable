import { expect, type Page, test } from "@playwright/test";

async function goto(path: string, page: Page) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
}

test.describe("anonymous web smoke", () => {
  test("renders the public home page with auth links", async ({ page }) => {
    await goto("/", page);

    await expect(
      page.getByRole("heading", { name: "Make timetables, together." }),
    ).toBeVisible();
    await expect(
      page.getByText("Sign in to create and join timetables."),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Create account" }),
    ).toBeVisible();
  });

  test("renders the sign-in shell instead of a blank page", async ({ page }) => {
    await goto("/sign-in", page);

    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(
      page.getByText("Continue with your account to access your timetables."),
    ).toBeVisible();
    await expect(page.locator("main")).toBeVisible();
  });

  test("renders the sign-up shell instead of a blank page", async ({ page }) => {
    await goto("/sign-up", page);

    await expect(
      page.getByRole("heading", { name: "Create account" }),
    ).toBeVisible();
    await expect(
      page.getByText("Create an account to create and join timetables."),
    ).toBeVisible();
    await expect(page.locator("main")).toBeVisible();
  });
});

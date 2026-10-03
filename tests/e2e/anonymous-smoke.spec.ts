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
  // installable-app (#367): every page carries the install markup, and
  // the manifest and icons answer without a session, a redirect or the
  // proxy (no CSP header means the proxy's matcher skipped them).
  test("carries the install manifest and Home Screen tags", async ({
    page,
    request,
  }) => {
    await goto("/sign-in", page);

    const head = page.locator("head");
    const manifestHref = await head
      .locator('link[rel="manifest"]')
      .getAttribute("href");
    expect(manifestHref).toBe("/manifest.webmanifest");
    await expect(head.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
      "href",
      "/apple-touch-icon.png",
    );
    await expect(
      head.locator('meta[name="apple-mobile-web-app-title"]'),
    ).toHaveAttribute("content", "Topic");
    await expect(
      head.locator('meta[name="apple-mobile-web-app-capable"]'),
    ).toHaveAttribute("content", "yes");
    await expect(
      head.locator('meta[name="mobile-web-app-capable"]'),
    ).toHaveAttribute("content", "yes");
    await expect(
      head.locator('meta[name="apple-mobile-web-app-status-bar-style"]'),
    ).toHaveAttribute("content", "default");
    const viewport = await head
      .locator('meta[name="viewport"]')
      .getAttribute("content");
    expect(viewport).toContain("viewport-fit=cover");
    // Zoom must stay available.
    expect(viewport).not.toContain("maximum-scale");
    expect(viewport).not.toContain("user-scalable");

    const res = await request.get("/manifest.webmanifest", {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-security-policy"]).toBeUndefined();
    const manifest = (await res.json()) as {
      name: string;
      short_name: string;
      display: string;
      start_url: string;
      scope: string;
      icons: { src: string; sizes: string; purpose?: string }[];
    };
    expect(manifest).toMatchObject({
      name: "Topic",
      short_name: "Topic",
      display: "standalone",
      start_url: "/timetables",
      scope: "/",
    });
    const icons = [
      ...manifest.icons.map((icon) => icon.src),
      "/apple-touch-icon.png",
    ];
    expect(icons).toHaveLength(4);
    for (const src of icons) {
      const icon = await request.get(src, { maxRedirects: 0 });
      expect(icon.status(), src).toBe(200);
      expect(icon.headers()["content-type"]).toBe("image/png");
    }
  });
});

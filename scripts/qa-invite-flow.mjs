/**
 * End-to-end QA of the add-person → populate → invite flow (issue #59,
 * product feedback round 2) against hosted dev. Run:
 *
 *   node scripts/qa-invite-flow.mjs
 *
 * Uses the seeded dev admin (Clerk test OTP 424242) on spt-test-data.
 * Creates a throwaway +clerk_test invitee each run; dev data only.
 */
import { chromium } from "playwright-core";

const BASE = process.env.QA_BASE_URL ?? "https://dev.timetable.love";
const SLUG = "spt-test-data";
const ADMIN = "admin-edwin+clerk_test@example.com";
const STAMP = Date.now().toString(36);
const INVITEE_NAME = `QA Invitee ${STAMP}`;
const INVITEE_EMAIL = `qa-invitee-${STAMP}+clerk_test@example.com`;
const TOPIC_TITLE = `QA invite-flow topic ${STAMP}`;
const OTP = "424242";
const SHOT_DIR = process.env.QA_SHOT_DIR ?? "/tmp";

let step = 0;
async function shot(page, name) {
  step += 1;
  const path = `${SHOT_DIR}/qa-invite-${String(step).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path, fullPage: false });
  console.log(`  📸 ${path}`);
}

async function signIn(page, email) {
  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await page.fill('input[name="identifier"]', email);
  await page.keyboard.press("Enter");
  await page.waitForSelector('input[autocomplete="one-time-code"]', {
    timeout: 20000,
  });
  await page.fill('input[autocomplete="one-time-code"]', OTP);
  await page.keyboard.press("Enter");
  try {
    await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), {
      timeout: 15000,
    });
  } catch {
    // Recent sign-ins hit Clerk's resend cooldown: wait for the Resend
    // button to enable, request a fresh code, and enter it again.
    console.log("  (resend cooldown — waiting for Resend)");
    await page
      .getByRole("button", { name: /resend/i })
      .click({ timeout: 60000 });
    const otpInput = page.locator('input[autocomplete="one-time-code"]');
    await otpInput.fill("");
    await otpInput.fill(OTP);
    await page.keyboard.press("Enter");
    await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), {
      timeout: 30000,
    });
  }
  console.log(`✓ signed in as ${email}`);
}

const browser = await chromium.launch();
try {
  // ---- Act 1: admin pre-creates and populates the account --------------
  const adminCtx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await adminCtx.newPage();
  await signIn(page, ADMIN);

  page.on("response", async (res) => {
    if (res.url().includes("/api/") && res.request().method() !== "GET") {
      const body = await res.text().catch(() => "<unreadable>");
      console.log(
        `  ↳ ${res.request().method()} ${res.url()} → ${res.status()} ${body.slice(0, 300)}`,
      );
    }
  });

  await page.goto(`${BASE}/t/${SLUG}/people`, { waitUntil: "networkidle" });
  await page.fill("#add-person-name", INVITEE_NAME);
  await page.fill("#add-person-email", INVITEE_EMAIL);
  // host role is the default — leave checkboxes as-is
  await page.getByRole("button", { name: "Add person" }).click();
  try {
    await page
      .getByText("Person added", { exact: false })
      .waitFor({ timeout: 20000 });
  } catch (err) {
    await shot(page, "add-person-FAILED");
    const toastText = await page
      .locator(".toast")
      .allTextContents()
      .catch(() => []);
    console.log("  toasts:", JSON.stringify(toastText));
    throw err;
  }
  console.log(`✓ added ${INVITEE_NAME} <${INVITEE_EMAIL}> (no email sent)`);

  await page.reload({ waitUntil: "networkidle" });
  const card = page.locator("li.card", { hasText: INVITEE_NAME });
  await card.waitFor({ timeout: 15000 });
  const chipBefore = await card.getByText(/Not invited yet/).count();
  if (chipBefore === 0)
    throw new Error("expected 'Not invited yet' chip on the new member");
  console.log("✓ member card shows 'Not invited yet'");
  await shot(page, "person-added");

  // Create a topic owned by the invitee
  await page.goto(`${BASE}/t/${SLUG}/topics`, { waitUntil: "networkidle" });
  await page.fill("#topic-title", TOPIC_TITLE);
  await page.waitForSelector("#topic-host", { timeout: 10000 });
  await page.selectOption("#topic-host", { label: INVITEE_NAME });
  await page.getByRole("button", { name: "Create topic" }).click();
  await page
    .getByText(`Topic created for ${INVITEE_NAME}`)
    .waitFor({ timeout: 15000 });
  console.log(`✓ created "${TOPIC_TITLE}" owned by ${INVITEE_NAME}`);
  await shot(page, "topic-created-for-invitee");

  // Send the invite
  await page.goto(`${BASE}/t/${SLUG}/people`, { waitUntil: "networkidle" });
  const card2 = page.locator("li.card", { hasText: INVITEE_NAME });
  await card2.getByRole("button", { name: "Send invite" }).click();
  await page
    .getByText("Invite sent", { exact: false })
    .waitFor({ timeout: 15000 });
  console.log("✓ invite sent");
  await page.reload({ waitUntil: "networkidle" });
  await page
    .locator("li.card", { hasText: INVITEE_NAME })
    .getByText(/Invited \d/)
    .waitFor({ timeout: 15000 });
  console.log("✓ chip flipped to 'Invited <date>' and survives reload");
  await shot(page, "invite-sent");
  await adminCtx.close();

  // ---- Act 2: the invitee's first sign-in ------------------------------
  const inviteeCtx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page2 = await inviteeCtx.newPage();
  await signIn(page2, INVITEE_EMAIL);

  await page2.goto(`${BASE}/t/${SLUG}/topics`, { waitUntil: "networkidle" });
  await page2.getByText(TOPIC_TITLE).first().waitFor({ timeout: 15000 });
  console.log(
    `✓ invitee's first sign-in: "${TOPIC_TITLE}" is waiting in My Topics`,
  );
  await shot(page2, "invitee-sees-topic");
  await inviteeCtx.close();

  console.log(
    "\n🎉 QA PASS: add person → topic as them → send invite → first sign-in has the topic",
  );
} finally {
  await browser.close();
}

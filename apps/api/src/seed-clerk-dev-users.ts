import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createClerkClient, type User } from "@clerk/backend";
import { config } from "dotenv";

import {
  fakeEmailFor,
  findSampleFile,
  parseFixture,
  userIdFor,
  type PersonFixture,
} from "@timetable/db/dev-seed";

config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

const SEEDED_ROLES = new Set(["owner", "admin", "host", "elector"]);

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const retryAfter =
        err instanceof Error &&
        "retryAfter" in err &&
        typeof (err as { retryAfter: unknown }).retryAfter === "number"
          ? (err as { retryAfter: number }).retryAfter
          : null;
      if (retryAfter !== null && attempt < 4) {
        console.log(`Rate limited — waiting ${retryAfter}s before retry...`);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Unreachable");
}

type SeedStatus = "created" | "updated" | "dry-run";

type SeedResult = {
  status: SeedStatus;
  label: string;
  email: string;
  externalId: string;
  roles: string;
  clerkUserId: string | null;
  warning: string | null;
};

function splitName(displayName: string): { firstName: string; lastName: string } {
  const [firstName = displayName, ...rest] = displayName.trim().split(/\s+/);
  return { firstName, lastName: rest.join(" ") };
}

function primaryEmail(user: User): string | null {
  return (
    user.primaryEmailAddress?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    null
  );
}

async function findExistingUser(
  client: ReturnType<typeof createClerkClient>,
  externalId: string,
  email: string,
): Promise<User | null> {
  const byExternalId = await withRetry(() =>
    client.users.getUserList({ externalId: [externalId], limit: 1 }),
  );
  if (byExternalId.data[0]) return byExternalId.data[0];

  const byEmail = await withRetry(() =>
    client.users.getUserList({ emailAddress: [email], limit: 1 }),
  );
  return byEmail.data[0] ?? null;
}

async function seedPerson(
  client: ReturnType<typeof createClerkClient>,
  person: PersonFixture,
  timetableSlug: string,
  dryRun: boolean,
): Promise<SeedResult> {
  const externalId = userIdFor(person.label);
  const email = fakeEmailFor(person.label);
  const roles = person.roles.join(", ");
  const metadata = {
    timetableDevSeed: {
      label: person.label,
      localUserId: externalId,
      roles: person.roles,
      timetableSlug,
    },
  };
  const { firstName, lastName } = splitName(person.displayName);
  const existing = await findExistingUser(client, externalId, email);

  if (dryRun) {
    return {
      status: "dry-run",
      label: person.label,
      email,
      externalId,
      roles,
      clerkUserId: existing?.id ?? null,
      warning: existing ? null : "would create",
    };
  }

  if (existing) {
    if (existing.externalId && existing.externalId !== externalId) {
      throw new Error(
        `Clerk user ${existing.id} already owns ${email} with externalId "${existing.externalId}", expected "${externalId}"`,
      );
    }

    const updated = await withRetry(() =>
      client.users.updateUser(existing.id, {
        externalId,
        firstName,
        lastName,
        skipLegalChecks: true,
      }),
    );
    await withRetry(() =>
      client.users.updateUserMetadata(updated.id, { privateMetadata: metadata }),
    );

    const existingEmail = primaryEmail(updated);
    return {
      status: "updated",
      label: person.label,
      email,
      externalId,
      roles,
      clerkUserId: updated.id,
      warning:
        existingEmail && existingEmail !== email
          ? `primary email is ${existingEmail}`
          : null,
    };
  }

  const created = await withRetry(() =>
    client.users.createUser({
      externalId,
      emailAddress: [email],
      username: person.label.toLowerCase().replace(/\s+/g, "-"),
      firstName,
      lastName,
      skipPasswordRequirement: true,
      skipLegalChecks: true,
      privateMetadata: metadata,
    }),
  );

  return {
    status: "created",
    label: person.label,
    email,
    externalId,
    roles,
    clerkUserId: created.id,
    warning: null,
  };
}

async function main(): Promise<void> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey || secretKey.includes("_xxx")) {
    throw new Error(
      "CLERK_SECRET_KEY must be set to a Clerk development secret key before seeding Clerk users",
    );
  }
  if (!secretKey.startsWith("sk_test_")) {
    throw new Error(
      "Refusing to seed Clerk users with a non-development CLERK_SECRET_KEY",
    );
  }

  const dryRun = process.argv.includes("--dry-run");
  const sampleFile = findSampleFile();
  const fixture = parseFixture(readFileSync(sampleFile, "utf8"));
  // Skip people with a real clerkId — they already have an account and the
  // local user row is seeded with their Clerk user ID directly.
  const people = fixture.people.filter(
    (person) =>
      !person.clerkId && person.roles.some((role) => SEEDED_ROLES.has(role)),
  );
  const client = createClerkClient({ secretKey });
  const results: SeedResult[] = [];

  for (const person of people) {
    results.push(
      await seedPerson(client, person, fixture.timetable.slug, dryRun),
    );
  }

  const created = results.filter((result) => result.status === "created").length;
  const updated = results.filter((result) => result.status === "updated").length;

  console.log(
    `${dryRun ? "Checked" : "Seeded"} ${results.length} Clerk dev users from ${sampleFile}`,
  );
  if (!dryRun) {
    console.log(`${created} created, ${updated} updated`);
  }
  console.log("Sign in with the listed emails using Clerk OTP code 424242.");

  for (const result of results) {
    const warning = result.warning ? ` (${result.warning})` : "";
    const clerkId = result.clerkUserId ? ` ${result.clerkUserId}` : "";
    console.log(
      `${result.status.padEnd(7)} ${result.email} -> ${result.externalId}${clerkId} [${result.roles}]${warning}`,
    );
  }
}

await main();

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A server file may RENDER a "use client" module's exports or pass them as
 * props, but calling one throws at request time ("Attempted to call X()
 * from the server but X is on the client"). Typecheck, build and the unit
 * tests all pass, so it shows up only on the deployed page: the
 * notifications page called `parseViewerPushKinds()` that way and failed on
 * every visit in production from 2026-10-26 (once push keys made the call
 * reachable) until it moved to lib/timetableSettings.ts.
 *
 * This walks src/ and fails on any server file that calls a lowercase
 * (non-component) function it imports from a "use client" module.
 */

const SRC = join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)
      ? [path]
      : [];
  });
}

const USE_CLIENT =
  /^\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*["']use client["']/;

function isClientModule(path: string): boolean {
  return USE_CLIENT.test(readFileSync(path, "utf8"));
}

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/")
    ? join(SRC, spec.slice(2))
    : spec.startsWith(".")
      ? join(dirname(from), spec)
      : null;
  if (!base) return null;
  for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const candidate = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

describe("client module boundary", () => {
  it('no server file calls a function from a "use client" module', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      if (isClientModule(file)) continue;
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(
        /import\s+(?!type\b)\{([^}]*)\}\s+from\s+["']([^"']+)["']/g,
      )) {
        const [, names = "", spec = ""] = m;
        const target = resolveImport(file, spec);
        if (!target || !isClientModule(target)) continue;
        const called = names
          .split(",")
          .map((name) => name.trim())
          .filter((name) => name && !name.startsWith("type "))
          .map((name) => name.split(/\s+as\s+/).pop()!)
          .filter(
            (name) =>
              /^[a-z]/.test(name) && new RegExp(`\\b${name}\\s*\\(`).test(src),
          );
        for (const name of called) {
          offenders.push(`${relative(SRC, file)} calls ${name}() from ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

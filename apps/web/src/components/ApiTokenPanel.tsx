"use client";

import { Check, Copy, KeyRound } from "lucide-react";
import { useState } from "react";

import {
  API_TOKEN_SCOPES,
  DEFAULT_TOKEN_EXPIRY_DAYS,
  SCOPE_LABELS,
  TOKEN_EXPIRY_CHOICES,
  type TokenScope,
} from "@timetable/shared";

import { useGqlAction } from "@/lib/useGqlAction";

const CREATE = `mutation($name: String!, $scopes: [String!]!, $days: Int) {
  createApiToken(name: $name, scopes: $scopes, expiresInDays: $days) {
    secret
    token { id name prefix scopes createdAt lastUsedAt expiresAt revokedAt }
  }
}`;

const REVOKE = `mutation($tokenId: String!) {
  revokeApiToken(tokenId: $tokenId)
}`;

export type ApiTokenRow = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
};

type CreateResult = { createApiToken: { secret: string } | null };

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function expiryLabel(days: number | null): string {
  if (days === null) return "No expiry";
  if (days === 365) return "1 year";
  return `${days} days`;
}

function tokenState(token: ApiTokenRow): string | null {
  if (token.revokedAt) return "Revoked";
  if (token.expiresAt && new Date(token.expiresAt) <= new Date())
    return "Expired";
  return null;
}

/** The secret, shown once. Nothing can recover it after this render. */
function SecretReveal({ secret }: { secret: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="notice" style={{ marginTop: 12 }}>
      <p style={{ margin: "0 0 8px", fontWeight: "var(--fw-bold)" }}>
        Copy this now — it won&rsquo;t be shown again.
      </p>
      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        <code className="mono" style={{ wordBreak: "break-all", flex: 1 }}>
          {secret}
        </code>
        <button className="btn btn-sm" onClick={copy} type="button">
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p style={{ margin: "8px 0 0" }}>
        Only its hash is stored. If you lose it, revoke the token and make a new
        one.
      </p>
    </div>
  );
}

function ScopeCheckboxes({
  chosen,
  onToggle,
}: {
  chosen: Set<TokenScope>;
  onToggle: (scope: TokenScope) => void;
}) {
  return (
    <div className="field">
      <label>What may it do?</label>
      <p className="hint" style={{ margin: "0 0 6px" }}>
        Reading needs no permission — every token can read whatever you can
        read. Tick only what this token needs to write.
      </p>
      {API_TOKEN_SCOPES.map((scope) => (
        <label
          key={scope}
          className="row"
          style={{ gap: 8, alignItems: "flex-start", padding: "3px 0" }}
        >
          <input
            type="checkbox"
            checked={chosen.has(scope)}
            onChange={() => onToggle(scope)}
          />
          <span>
            {SCOPE_LABELS[scope].label}
            <span className="hint"> — {SCOPE_LABELS[scope].description}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

function TokenTable({
  tokens,
  busy,
  onRevoke,
}: {
  tokens: ApiTokenRow[];
  busy: boolean;
  onRevoke: (token: ApiTokenRow) => void;
}) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Token</th>
          <th>Permissions</th>
          <th>Last used</th>
          <th>Expires</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {tokens.map((token) => {
          const state = tokenState(token);
          return (
            <tr key={token.id} style={state ? { opacity: 0.55 } : undefined}>
              <td>{token.name}</td>
              <td className="mono">tpk_{token.prefix}…</td>
              <td>
                {token.scopes.length === 0
                  ? "Read only"
                  : token.scopes
                      .map((s) => SCOPE_LABELS[s as TokenScope]?.label ?? s)
                      .join(", ")}
              </td>
              <td>{formatDate(token.lastUsedAt)}</td>
              <td>{state ?? formatDate(token.expiresAt)}</td>
              <td>
                {state ? null : (
                  <button
                    className="btn btn-sm btn-ghost"
                    type="button"
                    disabled={busy}
                    onClick={() => onRevoke(token)}
                  >
                    Revoke
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * Personal API token management. Account-level, not per-forum: one token
 * carries its owner's roles in every forum they're a member of, which the copy
 * says out loud because this panel lives on a forum's page.
 */
export function ApiTokenPanel({ tokens }: { tokens: ApiTokenRow[] }) {
  const { run, busy } = useGqlAction();
  const [name, setName] = useState("");
  const [chosen, setChosen] = useState<Set<TokenScope>>(new Set());
  const [days, setDays] = useState<number | null>(DEFAULT_TOKEN_EXPIRY_DAYS);
  const [secret, setSecret] = useState<string | null>(null);

  function toggle(scope: TokenScope) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
  }

  async function create() {
    if (!name.trim()) return;
    // Don't leave the previous secret on screen while the next one is minted.
    setSecret(null);
    await run<CreateResult>(
      CREATE,
      {
        name: name.trim(),
        scopes: API_TOKEN_SCOPES.filter((s) => chosen.has(s)),
        days,
      },
      {
        errorFallback: "Couldn't create the token",
        onSuccess: (data) => {
          setSecret(data.createApiToken?.secret ?? null);
          setName("");
          setChosen(new Set());
        },
      },
    );
  }

  async function revoke(token: ApiTokenRow) {
    if (
      !confirm(
        `Revoke "${token.name}"? Anything using it stops working immediately.`,
      )
    )
      return;
    await run(
      REVOKE,
      { tokenId: token.id },
      {
        success: `Revoked "${token.name}"`,
        errorFallback: "Couldn't revoke the token",
      },
    );
  }

  return (
    <div className="stack">
      {tokens.length > 0 ? (
        <TokenTable tokens={tokens} busy={busy} onRevoke={revoke} />
      ) : (
        <p className="faint">No tokens yet.</p>
      )}

      {secret ? <SecretReveal secret={secret} /> : null}

      <div className="card" style={{ marginTop: 4 }}>
        <h4 className="row" style={{ gap: 6, margin: "0 0 10px" }}>
          <KeyRound size={16} aria-hidden="true" />
          New token
        </h4>
        <div className="field">
          <label htmlFor="token-name">Name</label>
          <input
            id="token-name"
            value={name}
            maxLength={60}
            placeholder="Triage script on my laptop"
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <ScopeCheckboxes chosen={chosen} onToggle={toggle} />

        <div className="field">
          <label htmlFor="token-expiry">Expires</label>
          <select
            id="token-expiry"
            value={days === null ? "never" : String(days)}
            onChange={(e) =>
              setDays(
                e.target.value === "never" ? null : Number(e.target.value),
              )
            }
          >
            {TOKEN_EXPIRY_CHOICES.map((choice) => (
              <option
                key={choice ?? "never"}
                value={choice === null ? "never" : String(choice)}
              >
                {expiryLabel(choice)}
              </option>
            ))}
          </select>
        </div>

        <button
          className="btn btn-primary"
          type="button"
          onClick={create}
          disabled={busy || !name.trim()}
        >
          {busy ? "Creating…" : "Create token"}
        </button>
      </div>
    </div>
  );
}

"use client";

import { Keys, type KeyRow, type MintInput } from "@/hi2vi/frame";
import type { FormatOptions } from "@/lib/format";

import { mintCredentialAction, revokeCredentialAction } from "./actions";
import { mintOutcome, revokeOutcome } from "./model";

/**
 * The project's API keys: the frame's `Keys` with `scope="project"`, wired to the page's kept server
 * actions (`mintCredentialAction`, `revokeCredentialAction`), which revalidate the page so its list is
 * the truth after a mint or a revoke.
 */
export function ProjectKeys({
  projectId,
  subject,
  rows,
  format,
}: {
  projectId: string;
  subject: string;
  rows: readonly KeyRow[];
  format: FormatOptions;
}) {
  const mint = async ({ name, access }: MintInput) => {
    const form = new FormData();
    form.set("projectId", projectId);
    if (name !== null) form.set("name", name);
    form.set("scope", access);
    return mintOutcome(await mintCredentialAction({ error: null }, form));
  };
  const revoke = async (id: string) => {
    const form = new FormData();
    form.set("projectId", projectId);
    form.set("credentialId", id);
    return revokeOutcome(await revokeCredentialAction({ error: null }, form));
  };
  return (
    <Keys
      scope="project"
      subject={subject}
      rows={rows}
      mint={mint}
      revoke={revoke}
      format={format}
    />
  );
}

const nothing = async () => ({ ok: false }) as const;

/** F21's loading panel: the head with New key disabled, the seven column heads, three skeleton rows. */
export function ProjectKeysLoading() {
  return (
    <Keys
      scope="project"
      subject=""
      rows={[]}
      mint={async () => ({ ok: false, reason: "failed" })}
      revoke={nothing}
      loading
    />
  );
}

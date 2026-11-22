import { NextResponse } from "next/server";
import {
  readStore,
  sanitizeSettingsForClient,
  writeStore,
} from "@/lib/store";
import type { LlmProvider } from "@/lib/types";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    googleClientId?: string;
    googleClientSecret?: string;
    microsoftClientId?: string;
    microsoftClientSecret?: string;
    microsoftTenantId?: string;
    githubToken?: string;
    githubUsername?: string;
    localAllowlistPaths?: string[];
    llmProvider?: LlmProvider;
    llmApiKey?: string;
    sandboxEnabled?: boolean;
  };

  const store = readStore();
  const s = store.settings;

  if (body.googleClientId !== undefined)
    s.googleClientId = body.googleClientId.trim();
  if (body.googleClientSecret && !body.googleClientSecret.includes("••••")) {
    s.googleClientSecret = body.googleClientSecret.trim();
  }
  if (body.microsoftClientId !== undefined)
    s.microsoftClientId = body.microsoftClientId.trim();
  if (
    body.microsoftClientSecret &&
    !body.microsoftClientSecret.includes("••••")
  ) {
    s.microsoftClientSecret = body.microsoftClientSecret.trim();
  }
  if (body.microsoftTenantId !== undefined)
    s.microsoftTenantId = body.microsoftTenantId.trim() || "common";
  if (body.githubToken !== undefined && !body.githubToken.includes("••••")) {
    s.githubToken = body.githubToken.trim();
  }
  if (body.githubUsername !== undefined)
    s.githubUsername = body.githubUsername.trim();
  if (body.localAllowlistPaths !== undefined) {
    s.localAllowlistPaths = body.localAllowlistPaths
      .map((p) => p.trim())
      .filter(Boolean);
  }
  if (body.llmProvider !== undefined) s.llmProvider = body.llmProvider;
  if (body.llmApiKey !== undefined && !body.llmApiKey.includes("••••")) {
    s.llmApiKey = body.llmApiKey.trim();
  }
  if (body.sandboxEnabled !== undefined) {
    s.sandboxEnabled = body.sandboxEnabled;
  }

  writeStore(store);

  return NextResponse.json({
    ok: true,
    settings: sanitizeSettingsForClient(store.settings),
  });
}

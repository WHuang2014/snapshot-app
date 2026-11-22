import { NextResponse } from "next/server";
import {
  readStore,
  sanitizeConnectionsForClient,
  writeStore,
} from "@/lib/store";
import type { ProviderId } from "@/lib/types";

export async function POST(req: Request) {
  const body = (await req.json()) as { provider: ProviderId };
  const store = readStore();
  const conn = store.connections[body.provider];
  if (!conn) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }

  const fallbackSandbox = store.settings.sandboxEnabled;
  store.connections[body.provider] = {
    ...conn,
    accessToken: undefined,
    refreshToken: undefined,
    expiresAt: undefined,
    mode: fallbackSandbox ? "sandbox" : "unconfigured",
    status: fallbackSandbox ? "sandbox" : "unconfigured",
    lastVerifiedAt: new Date().toISOString(),
    verificationDetail: fallbackSandbox
      ? "Disconnected live token; reverted to Sandbox mode."
      : "Disconnected.",
  };

  writeStore(store);
  return NextResponse.json({
    ok: true,
    connections: sanitizeConnectionsForClient(store.connections),
  });
}

import { NextResponse } from "next/server";
import { verifyAllConnections } from "@/lib/connectors";
import {
  readStore,
  sanitizeConnectionsForClient,
  writeStore,
} from "@/lib/store";

export async function POST() {
  const store = readStore();
  const verified = await verifyAllConnections(store);
  store.connections = verified;
  writeStore(store);

  return NextResponse.json({
    ok: true,
    connections: sanitizeConnectionsForClient(verified),
    verifiedAt: new Date().toISOString(),
  });
}

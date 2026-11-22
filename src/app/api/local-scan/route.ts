import { NextResponse } from "next/server";
import { verifyAllConnections } from "@/lib/connectors";
import {
  readStore,
  sanitizeConnectionsForClient,
  writeStore,
} from "@/lib/store";
import type { LocalFolderScanPayload } from "@/lib/types";

export async function POST(req: Request) {
  const payload = (await req.json()) as LocalFolderScanPayload;
  if (!payload?.folderName || !Array.isArray(payload.files)) {
    return NextResponse.json(
      { error: "Invalid folder scan payload" },
      { status: 400 }
    );
  }

  const store = readStore();
  const others = store.localScans.filter(
    (s) => s.folderName !== payload.folderName
  );
  store.localScans = [payload, ...others];
  store.connections = await verifyAllConnections(store);
  writeStore(store);

  return NextResponse.json({
    ok: true,
    connections: sanitizeConnectionsForClient(store.connections),
    localScans: store.localScans.map((s) => ({
      folderName: s.folderName,
      scannedAt: s.scannedAt,
      fileCount: s.files.length,
      detectedStack: s.detectedStack,
    })),
  });
}

export async function DELETE() {
  const store = readStore();
  store.localScans = [];
  store.connections.local_fs = {
    ...store.connections.local_fs,
    mode: store.settings.sandboxEnabled ? "sandbox" : "unconfigured",
    status: store.settings.sandboxEnabled ? "sandbox" : "unconfigured",
    accountIdentifier: "Browser File System Access API",
    authorizedFolderNames: store.settings.sandboxEnabled
      ? ["~/projects (Demo)"]
      : [],
    verificationDetail: "Cleared browser folder handles.",
  };
  writeStore(store);
  return NextResponse.json({
    ok: true,
    connections: sanitizeConnectionsForClient(store.connections),
  });
}

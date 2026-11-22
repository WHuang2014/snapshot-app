import { NextResponse } from "next/server";
import {
  readStore,
  sanitizeConnectionsForClient,
  sanitizeSettingsForClient,
} from "@/lib/store";

export async function GET() {
  const store = readStore();
  return NextResponse.json({
    settings: sanitizeSettingsForClient(store.settings),
    connections: sanitizeConnectionsForClient(store.connections),
    localScans: store.localScans.map((s) => ({
      folderName: s.folderName,
      scannedAt: s.scannedAt,
      fileCount: s.files.length,
      detectedStack: s.detectedStack,
    })),
    snapshots: store.snapshots,
  });
}

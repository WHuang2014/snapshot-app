import { NextResponse } from "next/server";
import { readStore, writeStore } from "@/lib/store";

export async function GET() {
  const store = readStore();
  const gdrive = store.connections.gdrive;

  if (gdrive.mode !== "live" || !gdrive.accessToken) {
    return NextResponse.json({
      mode: gdrive.mode,
      folders: [
        { id: "demo-root-builds", name: "Builds & Specs (Demo)" },
        { id: "demo-design-assets", name: "Design Systems (Demo)" },
      ],
      selectedIds: gdrive.authorizedFolderIds ?? [],
    });
  }

  const res = await fetch(
    "https://www.googleapis.com/drive/v3/files?q=mimeType%3D%27application%2Fvnd.google-apps.folder%27%20and%20trashed%3Dfalse&pageSize=30&fields=files(id,name)",
    {
      headers: { Authorization: `Bearer ${gdrive.accessToken}` },
    }
  );

  if (!res.ok) {
    return NextResponse.json(
      { error: "Failed to list Google Drive folders" },
      { status: res.status }
    );
  }

  const data = (await res.json()) as {
    files?: { id: string; name: string }[];
  };

  return NextResponse.json({
    mode: "live",
    folders: data.files ?? [],
    selectedIds: gdrive.authorizedFolderIds ?? [],
  });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    folderIds: string[];
    folderNames: string[];
  };
  const store = readStore();
  store.connections.gdrive.authorizedFolderIds = body.folderIds ?? [];
  store.connections.gdrive.authorizedFolderNames = body.folderNames ?? [];
  writeStore(store);

  return NextResponse.json({
    ok: true,
    authorizedFolderIds: store.connections.gdrive.authorizedFolderIds,
    authorizedFolderNames: store.connections.gdrive.authorizedFolderNames,
  });
}

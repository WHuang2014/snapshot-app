import type { LocalFolderScanPayload } from "./types";

interface FsFileHandle {
  kind: "file";
  name: string;
  getFile: () => Promise<File>;
}

interface FsDirHandle {
  kind: "directory";
  name: string;
  values: () => AsyncIterable<FsFileHandle | FsDirHandle>;
}

declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      mode?: "read" | "readwrite";
    }) => Promise<FsDirHandle>;
  }
}

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "target",
  ".venv",
  "__pycache__",
]);

function inferStackFromNames(names: string[]): string[] {
  const stack = new Set<string>();
  const lower = new Set(names.map((n) => n.toLowerCase()));
  if (lower.has("package.json")) stack.add("Node.js");
  if (lower.has("tsconfig.json")) stack.add("TypeScript");
  if (lower.has("next.config.ts") || lower.has("next.config.mjs") || lower.has("next.config.js")) {
    stack.add("Next.js");
  }
  if (lower.has("cargo.toml")) stack.add("Rust");
  if (lower.has("pyproject.toml") || lower.has("requirements.txt")) {
    stack.add("Python");
  }
  if (lower.has("go.mod")) stack.add("Go");
  if (lower.has("dockerfile") || lower.has("docker-compose.yml")) {
    stack.add("Docker");
  }
  return Array.from(stack);
}

export async function pickAndScanLocalFolder(): Promise<LocalFolderScanPayload | null> {
  if (typeof window === "undefined" || !window.showDirectoryPicker) {
    return null;
  }

  const dirHandle = await window.showDirectoryPicker({ mode: "read" });
  const files: LocalFolderScanPayload["files"] = [];
  const topNames: string[] = [];
  let readmeExcerpt: string | undefined;

  async function walk(handle: FsDirHandle, prefix: string, depth: number) {
    if (depth > 3 || files.length >= 250) return;
    for await (const entry of handle.values()) {
      if (files.length >= 250) break;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (depth === 0) topNames.push(entry.name);

      if (entry.kind === "directory") {
        if (!IGNORED_DIRS.has(entry.name)) {
          await walk(entry, rel, depth + 1);
        }
      } else {
        const f = await entry.getFile();
        files.push({
          name: entry.name,
          relativePath: rel,
          size: f.size,
          lastModified: f.lastModified,
        });
        if (
          depth === 0 &&
          entry.name.toLowerCase() === "readme.md" &&
          !readmeExcerpt
        ) {
          const text = await f.text();
          readmeExcerpt = text
            .replace(/^#+\s*/gm, "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 180);
        }
      }
    }
  }

  await walk(dirHandle, "", 0);

  return {
    folderName: dirHandle.name,
    scannedAt: new Date().toISOString(),
    files,
    detectedStack: inferStackFromNames(topNames),
    readmeExcerpt,
  };
}

export function scanFileListFallback(
  fileList: FileList
): LocalFolderScanPayload | null {
  if (!fileList || fileList.length === 0) return null;
  const firstRel =
    (fileList[0] as File & { webkitRelativePath?: string }).webkitRelativePath ||
    fileList[0].name;
  const folderName = firstRel.split("/")[0] || "Selected Folder";
  const topNames: string[] = [];
  const files: LocalFolderScanPayload["files"] = [];

  for (let i = 0; i < Math.min(fileList.length, 250); i++) {
    const f = fileList[i];
    const rel =
      (f as File & { webkitRelativePath?: string }).webkitRelativePath ||
      f.name;
    const parts = rel.split("/");
    if (parts.length <= 2) topNames.push(f.name);
    files.push({
      name: f.name,
      relativePath: rel,
      size: f.size,
      lastModified: f.lastModified,
    });
  }

  return {
    folderName,
    scannedAt: new Date().toISOString(),
    files,
    detectedStack: inferStackFromNames(topNames),
  };
}

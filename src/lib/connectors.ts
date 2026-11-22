import fs from "fs";
import path from "path";
import {
  verifyGoogleTokenLive,
  verifyMicrosoftTokenLive,
} from "./oauth-helpers";
import {
  getSandboxDriveFiles,
  getSandboxGithubProjects,
  getSandboxGmailSignals,
  getSandboxLocalFiles,
  getSandboxOutlookSignals,
} from "./sandbox-data";
import type {
  AppSettings,
  EmailSignal,
  FileInventoryItem,
  ProjectItem,
  ProviderId,
  SourceConnection,
  StoreData,
} from "./types";

function classifyEmailCategory(
  subject: string,
  from: string
): EmailSignal["category"] {
  const text = `${subject} ${from}`.toLowerCase();
  if (
    text.includes("deploy") ||
    text.includes("vercel") ||
    text.includes("netlify") ||
    text.includes("release")
  ) {
    return "deployment";
  }
  if (
    text.includes("build") ||
    text.includes("pipeline") ||
    text.includes("ci") ||
    text.includes("github actions")
  ) {
    return "build";
  }
  if (
    text.includes("invoice") ||
    text.includes("receipt") ||
    text.includes("billing") ||
    text.includes("payment")
  ) {
    return "billing";
  }
  if (
    text.includes("security") ||
    text.includes("secret") ||
    text.includes("token") ||
    text.includes("oauth")
  ) {
    return "security";
  }
  return "thread";
}

export async function verifyAllConnections(
  store: StoreData
): Promise<Record<ProviderId, SourceConnection>> {
  const updated = { ...store.connections };
  const now = new Date().toISOString();

  // Gmail
  if (updated.gmail.mode === "live") {
    updated.gmail = await verifyGoogleTokenLive(updated.gmail, store.settings);
  } else if (store.settings.sandboxEnabled) {
    updated.gmail = {
      ...updated.gmail,
      mode: "sandbox",
      status: "sandbox",
      lastVerifiedAt: now,
    };
  }

  // Outlook
  if (updated.outlook.mode === "live") {
    updated.outlook = await verifyMicrosoftTokenLive(
      updated.outlook,
      store.settings
    );
  } else if (store.settings.sandboxEnabled) {
    updated.outlook = {
      ...updated.outlook,
      mode: "sandbox",
      status: "sandbox",
      lastVerifiedAt: now,
    };
  }

  // Google Drive
  if (updated.gdrive.mode === "live") {
    updated.gdrive = await verifyGoogleTokenLive(
      updated.gdrive,
      store.settings
    );
  } else if (store.settings.sandboxEnabled) {
    updated.gdrive = {
      ...updated.gdrive,
      mode: "sandbox",
      status: "sandbox",
      lastVerifiedAt: now,
    };
  }

  // GitHub
  if (store.settings.githubToken || store.settings.githubUsername) {
    try {
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "snapshot-app",
      };
      if (store.settings.githubToken) {
        headers.Authorization = `Bearer ${store.settings.githubToken}`;
      }
      const url = store.settings.githubToken
        ? "https://api.github.com/user"
        : `https://api.github.com/users/${encodeURIComponent(
            store.settings.githubUsername
          )}`;
      const res = await fetch(url, { headers });
      if (res.ok) {
        const user = (await res.json()) as { login?: string };
        const scopesHeader = res.headers.get("x-oauth-scopes");
        updated.github = {
          ...updated.github,
          mode: "live",
          status: "verified",
          accountIdentifier: user.login || store.settings.githubUsername,
          grantedScopes: scopesHeader
            ? scopesHeader
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : ["public_repos:read"],
          lastVerifiedAt: now,
          verificationDetail: store.settings.githubToken
            ? "Live GitHub PAT verified via /user."
            : "Live public GitHub profile verified.",
        };
      } else {
        updated.github = {
          ...updated.github,
          mode: "live",
          status: "revoked",
          lastVerifiedAt: now,
          verificationDetail: `GitHub API returned HTTP ${res.status}. Check token/username.`,
        };
      }
    } catch (err) {
      updated.github = {
        ...updated.github,
        mode: "live",
        status: "expired",
        lastVerifiedAt: now,
        verificationDetail: `GitHub verification error: ${
          err instanceof Error ? err.message : "unknown"
        }`,
      };
    }
  } else if (store.settings.sandboxEnabled) {
    updated.github = {
      ...updated.github,
      mode: "sandbox",
      status: "sandbox",
      lastVerifiedAt: now,
    };
  }

  // Local Folders
  const hasBrowserScans = store.localScans.length > 0;
  const validAllowlist = store.settings.localAllowlistPaths.filter((p) => {
    try {
      return fs.existsSync(p) && fs.statSync(p).isDirectory();
    } catch {
      return false;
    }
  });

  if (hasBrowserScans || validAllowlist.length > 0) {
    const names = [
      ...store.localScans.map((s) => s.folderName),
      ...validAllowlist.map((p) => path.basename(p) || p),
    ];
    updated.local_fs = {
      ...updated.local_fs,
      mode: "live",
      status: "verified",
      accountIdentifier: `${names.length} authorized folder(s)`,
      authorizedFolderNames: names,
      lastVerifiedAt: now,
      verificationDetail: `Verified read-only access to ${names.join(", ")}.`,
    };
  } else if (store.settings.sandboxEnabled) {
    updated.local_fs = {
      ...updated.local_fs,
      mode: "sandbox",
      status: "sandbox",
      lastVerifiedAt: now,
    };
  }

  return updated;
}

export async function readGmailData(
  connection: SourceConnection
): Promise<EmailSignal[]> {
  if (connection.mode === "sandbox") {
    return getSandboxGmailSignals();
  }
  if (connection.status !== "verified" || !connection.accessToken) {
    return [];
  }

  try {
    const listRes = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=12",
      {
        headers: { Authorization: `Bearer ${connection.accessToken}` },
      }
    );
    if (!listRes.ok) return [];
    const listData = (await listRes.json()) as {
      messages?: { id: string }[];
    };
    const ids = (listData.messages ?? []).slice(0, 10);

    const details = await Promise.all(
      ids.map(async (m) => {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          {
            headers: { Authorization: `Bearer ${connection.accessToken}` },
          }
        );
        if (!msgRes.ok) return null;
        const msg = (await msgRes.json()) as {
          id: string;
          snippet?: string;
          payload?: {
            headers?: { name: string; value: string }[];
          };
        };
        const headers = msg.payload?.headers ?? [];
        const subject =
          headers.find((h) => h.name.toLowerCase() === "subject")?.value ??
          "(No Subject)";
        const from =
          headers.find((h) => h.name.toLowerCase() === "from")?.value ??
          "Unknown";
        const dateRaw =
          headers.find((h) => h.name.toLowerCase() === "date")?.value ??
          new Date().toISOString();

        return {
          id: `gm-${msg.id}`,
          provider: "gmail" as const,
          subject,
          from,
          date: new Date(dateRaw).toISOString(),
          category: classifyEmailCategory(subject, from),
          snippet: msg.snippet ?? "",
        };
      })
    );

    return details.filter((d): d is NonNullable<typeof d> => d !== null);
  } catch {
    return [];
  }
}

export async function readOutlookData(
  connection: SourceConnection
): Promise<EmailSignal[]> {
  if (connection.mode === "sandbox") {
    return getSandboxOutlookSignals();
  }
  if (connection.status !== "verified" || !connection.accessToken) {
    return [];
  }

  try {
    const res = await fetch(
      "https://graph.microsoft.com/v1.0/me/messages?$top=12&$select=id,subject,from,receivedDateTime,bodyPreview",
      {
        headers: { Authorization: `Bearer ${connection.accessToken}` },
      }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      value?: {
        id: string;
        subject?: string;
        from?: { emailAddress?: { address?: string; name?: string } };
        receivedDateTime?: string;
        bodyPreview?: string;
      }[];
    };

    return (data.value ?? []).map((msg) => {
      const from =
        msg.from?.emailAddress?.address ||
        msg.from?.emailAddress?.name ||
        "Unknown";
      const subject = msg.subject || "(No Subject)";
      return {
        id: `ol-${msg.id}`,
        provider: "outlook",
        subject,
        from,
        date: msg.receivedDateTime || new Date().toISOString(),
        category: classifyEmailCategory(subject, from),
        snippet: (msg.bodyPreview || "").slice(0, 180),
      };
    });
  } catch {
    return [];
  }
}

export async function readDriveData(
  connection: SourceConnection
): Promise<FileInventoryItem[]> {
  if (connection.mode === "sandbox") {
    return getSandboxDriveFiles();
  }
  if (connection.status !== "verified" || !connection.accessToken) {
    return [];
  }

  try {
    const folderIds = connection.authorizedFolderIds ?? [];
    const q =
      folderIds.length > 0
        ? `(${folderIds
            .map((id) => `'${id}' in parents`)
            .join(" or ")}) and trashed = false`
        : "trashed = false";

    const url = `https://www.googleapis.com/drive/v3/files?pageSize=20&q=${encodeURIComponent(
      q
    )}&fields=files(id,name,mimeType,modifiedTime,size)&orderBy=modifiedTime desc`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${connection.accessToken}` },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      files?: {
        id: string;
        name: string;
        mimeType: string;
        modifiedTime?: string;
        size?: string;
      }[];
    };

    return (data.files ?? []).map((f) => ({
      id: `gd-${f.id}`,
      source: "gdrive",
      name: f.name,
      path: `Google Drive / ${f.name}`,
      kind:
        f.mimeType === "application/vnd.google-apps.folder" ? "folder" : "file",
      modifiedAt: f.modifiedTime ?? new Date().toISOString(),
      sizeLabel: f.size
        ? `${Math.max(1, Math.round(Number(f.size) / 1024))} KB`
        : undefined,
    }));
  } catch {
    return [];
  }
}

export async function readGithubData(
  connection: SourceConnection,
  settings: AppSettings
): Promise<ProjectItem[]> {
  if (connection.mode === "sandbox") {
    return getSandboxGithubProjects();
  }
  if (connection.status !== "verified") {
    return [];
  }

  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "snapshot-app",
    };
    if (settings.githubToken) {
      headers.Authorization = `Bearer ${settings.githubToken}`;
    }

    const url = settings.githubToken
      ? "https://api.github.com/user/repos?sort=updated&per_page=12"
      : `https://api.github.com/users/${encodeURIComponent(
          settings.githubUsername
        )}/repos?sort=updated&per_page=12`;

    const res = await fetch(url, { headers });
    if (!res.ok) return [];
    const repos = (await res.json()) as {
      id: number;
      name: string;
      description: string | null;
      language: string | null;
      stargazers_count: number;
      open_issues_count: number;
      pushed_at: string;
      html_url: string;
      archived: boolean;
    }[];

    return repos.map((repo) => ({
      id: `gh-${repo.id}`,
      name: repo.name,
      source: "github",
      description: repo.description || "GitHub repository indexed live.",
      techStack: repo.language ? [repo.language] : ["Repository"],
      status: repo.archived ? "paused" : "active",
      lastActivityAt: repo.pushed_at,
      url: repo.html_url,
      metricsLabel: `${repo.stargazers_count} stars · ${repo.open_issues_count} open issues`,
    }));
  } catch {
    return [];
  }
}

export function readLocalFolderData(
  connection: SourceConnection,
  store: StoreData
): { files: FileInventoryItem[]; projects: ProjectItem[] } {
  if (connection.mode === "sandbox") {
    return { files: getSandboxLocalFiles(), projects: [] };
  }

  const files: FileInventoryItem[] = [];
  const projects: ProjectItem[] = [];

  for (const scan of store.localScans) {
    files.push({
      id: `loc-scan-${scan.folderName}`,
      source: "local_fs",
      name: scan.folderName,
      path: `Local / ${scan.folderName} (${scan.files.length} files)`,
      kind: "folder",
      modifiedAt: scan.scannedAt,
      detectedStack: scan.detectedStack,
    });

    if (scan.detectedStack.length > 0) {
      projects.push({
        id: `loc-proj-${scan.folderName}`,
        name: scan.folderName,
        source: "local_fs",
        description:
          scan.readmeExcerpt ||
          `Local workspace folder with ${scan.files.length} indexed files.`,
        techStack: scan.detectedStack,
        status: "active",
        lastActivityAt: scan.scannedAt,
        metricsLabel: `${scan.files.length} files`,
      });
    }
  }

  for (const dirPath of store.settings.localAllowlistPaths) {
    try {
      if (!fs.existsSync(dirPath)) continue;
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const stack: string[] = [];
      const names = entries.map((e) => e.name);
      if (names.includes("package.json")) stack.push("Node.js / JS");
      if (names.includes("tsconfig.json")) stack.push("TypeScript");
      if (names.includes("Cargo.toml")) stack.push("Rust");
      if (names.includes("pyproject.toml") || names.includes("requirements.txt"))
        stack.push("Python");
      if (names.includes("go.mod")) stack.push("Go");

      const folderName = path.basename(dirPath) || dirPath;
      const stat = fs.statSync(dirPath);

      files.push({
        id: `loc-fs-${folderName}`,
        source: "local_fs",
        name: folderName,
        path: dirPath,
        kind: "folder",
        modifiedAt: stat.mtime.toISOString(),
        detectedStack: stack,
      });

      if (stack.length > 0) {
        projects.push({
          id: `loc-fs-proj-${folderName}`,
          name: folderName,
          source: "local_fs",
          description: `Server-authorized directory at ${dirPath} (${entries.length} top-level entries).`,
          techStack: stack,
          status: "active",
          lastActivityAt: stat.mtime.toISOString(),
          metricsLabel: `${entries.length} entries`,
        });
      }
    } catch {
      // skip unreadable directory
    }
  }

  return { files, projects };
}

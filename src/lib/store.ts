import fs from "fs";
import path from "path";
import type {
  AppSettings,
  ProviderId,
  SourceConnection,
  StoreData,
} from "./types";

const DATA_DIR = path.join(process.cwd(), ".data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

function defaultSettings(): AppSettings {
  return {
    googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    microsoftClientId: process.env.MICROSOFT_CLIENT_ID ?? "",
    microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
    microsoftTenantId: process.env.MICROSOFT_TENANT_ID ?? "common",
    githubToken: process.env.GITHUB_TOKEN ?? "",
    githubUsername: process.env.GITHUB_USERNAME ?? "",
    localAllowlistPaths: [],
    llmProvider: "none",
    llmApiKey: "",
    sandboxEnabled: true,
  };
}

function defaultConnections(): Record<ProviderId, SourceConnection> {
  return {
    gmail: {
      id: "gmail",
      label: "Gmail",
      category: "email",
      mode: "sandbox",
      status: "sandbox",
      accountIdentifier: "demo.builder@gmail.com",
      grantedScopes: ["https://www.googleapis.com/auth/gmail.readonly"],
      requiredReadOnlyScopes: [
        "https://www.googleapis.com/auth/gmail.readonly",
      ],
      lastVerifiedAt: new Date().toISOString(),
      verificationDetail:
        "Sandbox mode active — connect Google OAuth in Setup to read live Gmail.",
    },
    outlook: {
      id: "outlook",
      label: "Microsoft Outlook",
      category: "email",
      mode: "sandbox",
      status: "sandbox",
      accountIdentifier: "demo.builder@outlook.com",
      grantedScopes: ["Mail.Read", "User.Read"],
      requiredReadOnlyScopes: ["Mail.Read", "User.Read"],
      lastVerifiedAt: new Date().toISOString(),
      verificationDetail:
        "Sandbox mode active — connect Microsoft OAuth in Setup to read live Outlook.",
    },
    gdrive: {
      id: "gdrive",
      label: "Google Drive",
      category: "files",
      mode: "sandbox",
      status: "sandbox",
      accountIdentifier: "demo.builder@gmail.com",
      grantedScopes: ["https://www.googleapis.com/auth/drive.readonly"],
      requiredReadOnlyScopes: [
        "https://www.googleapis.com/auth/drive.readonly",
      ],
      authorizedFolderIds: ["demo-root-builds"],
      authorizedFolderNames: ["Builds & Specs (Demo)"],
      lastVerifiedAt: new Date().toISOString(),
      verificationDetail:
        "Sandbox mode active — authorize Drive OAuth to pick live folders.",
    },
    github: {
      id: "github",
      label: "GitHub",
      category: "code",
      mode: "sandbox",
      status: "sandbox",
      accountIdentifier: "demo-builder",
      grantedScopes: ["read:user", "repo (read-only)"],
      requiredReadOnlyScopes: ["read:user"],
      lastVerifiedAt: new Date().toISOString(),
      verificationDetail:
        "Sandbox mode active — add a GitHub username or read-only PAT in Setup.",
    },
    local_fs: {
      id: "local_fs",
      label: "Local Folders",
      category: "files",
      mode: "sandbox",
      status: "sandbox",
      accountIdentifier: "Browser File System Access API",
      grantedScopes: ["read-only-directory-handle"],
      requiredReadOnlyScopes: ["read-only-directory-handle"],
      authorizedFolderNames: ["~/projects (Demo)"],
      lastVerifiedAt: new Date().toISOString(),
      verificationDetail:
        "Use 'Pick Local Folder' to grant live read-only browser access to any folder.",
    },
  };
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function readStore(): StoreData {
  ensureDir();
  if (!fs.existsSync(STORE_PATH)) {
    const initial: StoreData = {
      settings: defaultSettings(),
      connections: defaultConnections(),
      localScans: [],
      snapshots: [],
    };
    writeStore(initial);
    return initial;
  }

  try {
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as StoreData;
    return {
      settings: { ...defaultSettings(), ...(parsed.settings ?? {}) },
      connections: { ...defaultConnections(), ...(parsed.connections ?? {}) },
      localScans: parsed.localScans ?? [],
      snapshots: parsed.snapshots ?? [],
    };
  } catch {
    const fallback: StoreData = {
      settings: defaultSettings(),
      connections: defaultConnections(),
      localScans: [],
      snapshots: [],
    };
    writeStore(fallback);
    return fallback;
  }
}

export function writeStore(data: StoreData): void {
  ensureDir();
  const tmpPath = `${STORE_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmpPath, STORE_PATH);
}

export function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export function sanitizeSettingsForClient(settings: AppSettings) {
  return {
    googleClientId: settings.googleClientId,
    hasGoogleClientSecret: Boolean(settings.googleClientSecret),
    googleClientSecretMasked: maskSecret(settings.googleClientSecret),
    microsoftClientId: settings.microsoftClientId,
    hasMicrosoftClientSecret: Boolean(settings.microsoftClientSecret),
    microsoftClientSecretMasked: maskSecret(settings.microsoftClientSecret),
    microsoftTenantId: settings.microsoftTenantId || "common",
    hasGithubToken: Boolean(settings.githubToken),
    githubTokenMasked: maskSecret(settings.githubToken),
    githubUsername: settings.githubUsername,
    localAllowlistPaths: settings.localAllowlistPaths,
    llmProvider: settings.llmProvider,
    hasLlmApiKey: Boolean(settings.llmApiKey),
    llmApiKeyMasked: maskSecret(settings.llmApiKey),
    sandboxEnabled: settings.sandboxEnabled,
  };
}

export function sanitizeConnectionsForClient(
  connections: Record<ProviderId, SourceConnection>
): Record<ProviderId, Omit<SourceConnection, "accessToken" | "refreshToken">> {
  const result = {} as Record<
    ProviderId,
    Omit<SourceConnection, "accessToken" | "refreshToken">
  >;
  (Object.keys(connections) as ProviderId[]).forEach((key) => {
    const { accessToken: _a, refreshToken: _r, ...rest } = connections[key];
    void _a;
    void _r;
    result[key] = rest;
  });
  return result;
}

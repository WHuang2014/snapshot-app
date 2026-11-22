export type ProviderId = "gmail" | "outlook" | "gdrive" | "github" | "local_fs";

export type ConnectionMode = "live" | "sandbox" | "unconfigured";

export type VerificationStatus =
  | "verified"
  | "sandbox"
  | "expired"
  | "revoked"
  | "unconfigured";

export interface SourceConnection {
  id: ProviderId;
  label: string;
  category: "email" | "files" | "code";
  mode: ConnectionMode;
  status: VerificationStatus;
  accountIdentifier: string;
  grantedScopes: string[];
  requiredReadOnlyScopes: string[];
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  lastVerifiedAt?: string;
  verificationDetail?: string;
  authorizedFolderIds?: string[];
  authorizedFolderNames?: string[];
}

export type LlmProvider = "none" | "openai" | "anthropic" | "gemini";

export interface MessagingSettings {
  telegramBotToken: string;
  telegramBotUsername: string;
  telegramWebhookSecret: string;
  allowedTelegramChatIds: string[];
  whatsappPhoneNumberId: string;
  whatsappAccessToken: string;
  whatsappVerifyToken: string;
  whatsappAppSecret: string;
  whatsappBusinessNumber: string;
  allowedWhatsappNumbers: string[];
}

export type SecuritySeverity = "critical" | "high" | "medium" | "low" | "pass";

export interface SecurityFinding {
  id: string;
  category:
    | "oauth_scopes"
    | "token_hygiene"
    | "webhook_auth"
    | "filesystem"
    | "secrets_exposure";
  severity: SecuritySeverity;
  title: string;
  detail: string;
  remediation: string;
}

export interface SecurityAuditReport {
  id: string;
  runAt: string;
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  summary: string;
  findings: SecurityFinding[];
  counts: Record<SecuritySeverity, number>;
}

export interface AppSettings {
  googleClientId: string;
  googleClientSecret: string;
  microsoftClientId: string;
  microsoftClientSecret: string;
  microsoftTenantId: string;
  githubToken: string;
  githubUsername: string;
  localAllowlistPaths: string[];
  llmProvider: LlmProvider;
  llmApiKey: string;
  sandboxEnabled: boolean;
  messaging: MessagingSettings;
}

export interface ProjectItem {
  id: string;
  name: string;
  source: ProviderId;
  description: string;
  techStack: string[];
  status: "active" | "shipped" | "paused";
  lastActivityAt: string;
  url?: string;
  metricsLabel?: string;
}

export interface TimelineEvent {
  id: string;
  date: string;
  source: ProviderId;
  title: string;
  detail: string;
}

export interface EmailSignal {
  id: string;
  provider: "gmail" | "outlook";
  subject: string;
  from: string;
  date: string;
  category: "deployment" | "build" | "billing" | "thread" | "security";
  snippet: string;
}

export interface FileInventoryItem {
  id: string;
  source: "gdrive" | "local_fs";
  name: string;
  path: string;
  kind: "folder" | "file";
  modifiedAt: string;
  sizeLabel?: string;
  detectedStack?: string[];
}

export interface SnapshotDiff {
  previousSnapshotId: string;
  previousIndexNumber: number;
  summaryBullets: string[];
  newProjectsCount: number;
  newEmailsCount: number;
  newFilesCount: number;
}

export interface VerificationReceiptEntry {
  provider: ProviderId;
  label: string;
  status: VerificationStatus;
  mode: ConnectionMode;
  account: string;
  scopes: string[];
  checkedAt: string;
  detail: string;
}

export interface SnapshotRecord {
  id: string;
  indexNumber: number;
  createdAt: string;
  title: string;
  modeLabel: "LIVE VERIFIED" | "HYBRID (LIVE + SANDBOX)" | "SANDBOX DEMO";
  synthesisMethod: "deterministic" | "openai" | "anthropic" | "gemini";
  executiveSummary: string;
  projects: ProjectItem[];
  timeline: TimelineEvent[];
  emailSignals: EmailSignal[];
  fileInventory: FileInventoryItem[];
  verificationReceipt: VerificationReceiptEntry[];
  diffFromPrevious: SnapshotDiff | null;
}

export interface LocalFolderScanPayload {
  folderName: string;
  scannedAt: string;
  files: {
    name: string;
    relativePath: string;
    size: number;
    lastModified: number;
  }[];
  detectedStack: string[];
  readmeExcerpt?: string;
}

export interface StoreData {
  settings: AppSettings;
  connections: Record<ProviderId, SourceConnection>;
  localScans: LocalFolderScanPayload[];
  snapshots: SnapshotRecord[];
  securityAudits: SecurityAuditReport[];
}

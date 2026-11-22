import fs from "fs";
import path from "path";
import { readStore, writeStore } from "./store";
import type {
  ProviderId,
  SecurityAuditReport,
  SecurityFinding,
  SecuritySeverity,
} from "./types";

const DANGEROUS_ROOTS = new Set(["/", "/etc", "/usr", "/var", "/bin", "/sbin", "/root", "/home"]);

export function runSecurityAudit(): SecurityAuditReport {
  const store = readStore();
  const findings: SecurityFinding[] = [];

  // 1. OAuth Scope Least-Privilege Check
  const writeScopeIndicators = [
    "gmail.modify",
    "gmail.send",
    "gmail.compose",
    "https://mail.google.com/",
    "drive.file",
    "https://www.googleapis.com/auth/drive",
    "Mail.ReadWrite",
    "Mail.Send",
  ];

  (Object.keys(store.connections) as ProviderId[]).forEach((id) => {
    const conn = store.connections[id];
    const broadScopes = conn.grantedScopes.filter((s) =>
      writeScopeIndicators.some((w) => s === w || s.includes("ReadWrite"))
    );

    if (broadScopes.length > 0) {
      findings.push({
        id: `sec-scope-${id}`,
        category: "oauth_scopes",
        severity: "high",
        title: `Over-privileged scopes detected on ${conn.label}`,
        detail: `Granted scopes include write/modify permissions: ${broadScopes.join(", ")}.`,
        remediation: `Re-authorize ${conn.label} with strict read-only scopes (${conn.requiredReadOnlyScopes.join(", ")}).`,
      });
    } else {
      findings.push({
        id: `sec-scope-ok-${id}`,
        category: "oauth_scopes",
        severity: "pass",
        title: `${conn.label} enforces least-privilege read-only scopes`,
        detail: `Active scopes: ${conn.grantedScopes.join(", ") || "none"}.`,
        remediation: "No action needed.",
      });
    }

    if (conn.mode === "live" && (conn.status === "expired" || conn.status === "revoked")) {
      findings.push({
        id: `sec-token-${id}`,
        category: "token_hygiene",
        severity: "medium",
        title: `${conn.label} live token is ${conn.status}`,
        detail: conn.verificationDetail || "Token failed live verification.",
        remediation: `Re-authorize ${conn.label} in 02 // Connections or disconnect it.`,
      });
    }
  });

  // 2. GitHub PAT Scope Check
  if (store.settings.githubToken) {
    const ghScopes = store.connections.github.grantedScopes;
    if (ghScopes.includes("repo") || ghScopes.includes("delete_repo") || ghScopes.includes("admin:org")) {
      findings.push({
        id: "sec-gh-pat",
        category: "oauth_scopes",
        severity: "medium",
        title: "GitHub PAT has broad repository write/admin scopes",
        detail: `Detected scopes: ${ghScopes.join(", ")}.`,
        remediation:
          "Use a fine-grained GitHub Personal Access Token with Read-only Metadata & Contents permissions.",
      });
    }
  }

  // 3. Telegram Webhook & Sender Allowlist Check
  const msg = store.settings.messaging;
  if (msg.telegramBotToken) {
    if (!msg.telegramWebhookSecret) {
      findings.push({
        id: "sec-tg-secret",
        category: "webhook_auth",
        severity: "critical",
        title: "Telegram webhook secret token is missing",
        detail:
          "Without X-Telegram-Bot-Api-Secret-Token verification, any external caller could forge webhook payloads to /api/channels/telegram/webhook.",
        remediation:
          "Set a strong Telegram Webhook Secret in 03 // Setup Wizard and re-register the webhook.",
      });
    } else {
      findings.push({
        id: "sec-tg-secret-ok",
        category: "webhook_auth",
        severity: "pass",
        title: "Telegram webhook secret token configured",
        detail: "Incoming Telegram updates are verified via X-Telegram-Bot-Api-Secret-Token.",
        remediation: "No action needed.",
      });
    }

    if (msg.allowedTelegramChatIds.length === 0) {
      findings.push({
        id: "sec-tg-allowlist",
        category: "webhook_auth",
        severity: "high",
        title: "Telegram allowed chat ID list is empty",
        detail:
          "If your bot username is discoverable, any Telegram user could send /snapshot or /audit commands.",
        remediation:
          "Add your personal Telegram numeric Chat ID to Allowed Telegram Chat IDs.",
      });
    } else {
      findings.push({
        id: "sec-tg-allowlist-ok",
        category: "webhook_auth",
        severity: "pass",
        title: `Telegram sender allowlist active (${msg.allowedTelegramChatIds.length} ID)`,
        detail: "Only explicitly authorized Telegram chat IDs can execute commands.",
        remediation: "No action needed.",
      });
    }
  }

  // 4. WhatsApp Webhook & Signature Check
  if (msg.whatsappAccessToken || msg.whatsappPhoneNumberId) {
    if (!msg.whatsappAppSecret) {
      findings.push({
        id: "sec-wa-sig",
        category: "webhook_auth",
        severity: "critical",
        title: "WhatsApp App Secret (HMAC-SHA256) is not configured",
        detail:
          "Without X-Hub-Signature-256 verification, /api/channels/whatsapp/webhook cannot cryptographically verify Meta payloads.",
        remediation:
          "Add your Meta App Secret in 03 // Setup Wizard to enforce HMAC-SHA256 signature verification.",
      });
    } else {
      findings.push({
        id: "sec-wa-sig-ok",
        category: "webhook_auth",
        severity: "pass",
        title: "WhatsApp HMAC-SHA256 signature verification enabled",
        detail: "Incoming WhatsApp webhooks are verified using X-Hub-Signature-256.",
        remediation: "No action needed.",
      });
    }

    if (msg.allowedWhatsappNumbers.length === 0) {
      findings.push({
        id: "sec-wa-allowlist",
        category: "webhook_auth",
        severity: "high",
        title: "WhatsApp sender phone allowlist is empty",
        detail:
          "Any WhatsApp number messaging your Business number could trigger snapshot or audit commands.",
        remediation:
          "Add your personal E.164 phone number (without +) to Allowed WhatsApp Numbers.",
      });
    }
  }

  // 5. Local Filesystem Allowlist Path Hygiene
  for (const dirPath of store.settings.localAllowlistPaths) {
    const normalized = path.resolve(dirPath);
    if (DANGEROUS_ROOTS.has(normalized)) {
      findings.push({
        id: `sec-fs-root-${normalized}`,
        category: "filesystem",
        severity: "critical",
        title: `Overly broad server directory allowlisted: ${normalized}`,
        detail:
          "Allowlisting a system or root directory can expose sensitive OS files or user credentials.",
        remediation: `Replace ${normalized} with a specific project subdirectory.`,
      });
    }
  }

  // 6. .gitignore & Local Store Hygiene
  const gitignorePath = path.join(process.cwd(), ".gitignore");
  let dataIgnored = false;
  let envIgnored = false;
  if (fs.existsSync(gitignorePath)) {
    const gi = fs.readFileSync(gitignorePath, "utf-8");
    dataIgnored = gi.includes(".data/");
    envIgnored = gi.includes(".env");
  }

  if (!dataIgnored || !envIgnored) {
    findings.push({
      id: "sec-gitignore",
      category: "secrets_exposure",
      severity: "high",
      title: "Sensitive local directories not fully ignored in .gitignore",
      detail: `.data/ ignored: ${dataIgnored}, .env* ignored: ${envIgnored}.`,
      remediation: "Ensure both .data/ and .env* are listed in .gitignore.",
    });
  } else {
    findings.push({
      id: "sec-gitignore-ok",
      category: "secrets_exposure",
      severity: "pass",
      title: ".data/ and .env* are excluded from Git tracking",
      detail: "Local OAuth tokens and snapshot archives will not be pushed to GitHub.",
      remediation: "No action needed.",
    });
  }

  // 7. Plaintext local store advisory if live secrets exist
  const hasStoredSecrets = Boolean(
    store.settings.googleClientSecret ||
      store.settings.microsoftClientSecret ||
      store.settings.githubToken ||
      store.settings.llmApiKey ||
      msg.telegramBotToken ||
      msg.whatsappAccessToken
  );
  if (hasStoredSecrets) {
    findings.push({
      id: "sec-store-plaintext",
      category: "secrets_exposure",
      severity: "low",
      title: "Secrets persisted in local .data/store.json",
      detail:
        "Credentials saved via the Setup Wizard are stored locally in .data/store.json (sanitized from all browser API responses).",
      remediation:
        "For production cloud hosting, move secrets into environment variables (.env.local / host secret manager).",
    });
  }

  const counts: Record<SecuritySeverity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    pass: 0,
  };
  for (const f of findings) counts[f.severity]++;

  const penalty =
    counts.critical * 30 +
    counts.high * 18 +
    counts.medium * 8 +
    counts.low * 3;
  const score = Math.max(0, Math.min(100, 100 - penalty));
  const grade: SecurityAuditReport["grade"] =
    score >= 90
      ? "A"
      : score >= 75
      ? "B"
      : score >= 60
      ? "C"
      : score >= 40
      ? "D"
      : "F";

  const report: SecurityAuditReport = {
    id: `sec-${Date.now()}`,
    runAt: new Date().toISOString(),
    score,
    grade,
    summary: `Security Agent inspected OAuth scopes, token hygiene, webhook authentication, filesystem allowlists, and secret exposure. Score: ${score}/100 (Grade ${grade}) — ${counts.critical} critical, ${counts.high} high, ${counts.medium} medium, ${counts.low} low.`,
    findings,
    counts,
  };

  store.securityAudits = [report, ...store.securityAudits].slice(0, 15);
  writeStore(store);

  return report;
}

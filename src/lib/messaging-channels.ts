import crypto from "crypto";
import { verifyAllConnections } from "./connectors";
import { runSecurityAudit } from "./security-agent";
import { generateSnapshot } from "./snapshot-engine";
import { readStore, writeStore } from "./store";
import type { ProviderId } from "./types";

export function verifyWhatsappSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): boolean {
  if (!appSecret) return true; // Enforced when configured; flagged by Security Agent if missing
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function executeChannelCommand(
  rawText: string
): Promise<string> {
  const cmd = rawText.trim().toLowerCase();

  if (cmd.includes("snapshot") || cmd === "/start" || cmd === "/run") {
    const snap = await generateSnapshot();
    return [
      `SNAPSHOT // #${String(snap.indexNumber).padStart(2, "0")} (${snap.modeLabel})`,
      `Projects: ${snap.projects.length} | Emails: ${snap.emailSignals.length} | Files: ${snap.fileInventory.length}`,
      "",
      snap.executiveSummary,
    ].join("\n");
  }

  if (cmd.includes("audit") || cmd.includes("security")) {
    const report = runSecurityAudit();
    const topIssues = report.findings
      .filter((f) => f.severity !== "pass")
      .slice(0, 3)
      .map((f) => `- [${f.severity.toUpperCase()}] ${f.title}`)
      .join("\n");
    return [
      `SECURITY AGENT // SCORE ${report.score}/100 (GRADE ${report.grade})`,
      report.summary,
      topIssues ? `\nTop Findings:\n${topIssues}` : "\nNo issues detected.",
    ].join("\n");
  }

  if (cmd.includes("verify") || cmd.includes("permission")) {
    const store = readStore();
    const verified = await verifyAllConnections(store);
    store.connections = verified;
    writeStore(store);
    const lines = (Object.keys(verified) as ProviderId[]).map(
      (k) => `- ${verified[k].label}: ${verified[k].status.toUpperCase()} (${verified[k].mode})`
    );
    return ["PERMISSION VERIFICATION // LIVE CHECK", ...lines].join("\n");
  }

  return [
    "SNAPSHOT // CHANNEL COMMANDS",
    "- /snapshot — Generate a fresh build snapshot",
    "- /audit — Run the Security Agent loophole review",
    "- /verify — Re-verify live OAuth & folder permissions",
  ].join("\n");
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(
    `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: `Telegram API ${res.status}: ${body.slice(0, 140)}` };
  }
  return { ok: true };
}

export async function sendWhatsappMessage(
  phoneNumberId: string,
  accessToken: string,
  toNumber: string,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(
      phoneNumberId
    )}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toNumber,
        type: "text",
        text: { body: text },
      }),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: `WhatsApp API ${res.status}: ${body.slice(0, 140)}` };
  }
  return { ok: true };
}

import { NextResponse } from "next/server";
import {
  sendTelegramMessage,
  sendWhatsappMessage,
} from "@/lib/messaging-channels";
import { runSecurityAudit } from "@/lib/security-agent";
import { generateSnapshot } from "@/lib/snapshot-engine";
import { readStore } from "@/lib/store";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    channel: "telegram" | "whatsapp";
    kind?: "snapshot" | "audit";
  };

  const store = readStore();
  const msg = store.settings.messaging;

  let text = "";
  if (body.kind === "audit") {
    const report = store.securityAudits[0] ?? runSecurityAudit();
    text = `SECURITY AGENT // ${report.score}/100 (Grade ${report.grade})\n${report.summary}`;
  } else {
    const snap = store.snapshots[0] ?? (await generateSnapshot());
    text = [
      `SNAPSHOT // #${String(snap.indexNumber).padStart(2, "0")} (${snap.modeLabel})`,
      `Projects: ${snap.projects.length} | Emails: ${snap.emailSignals.length} | Files: ${snap.fileInventory.length}`,
      "",
      snap.executiveSummary,
    ].join("\n");
  }

  if (body.channel === "telegram") {
    const chatId = msg.allowedTelegramChatIds[0];
    if (!msg.telegramBotToken || !chatId) {
      return NextResponse.json(
        {
          error:
            "Configure Telegram Bot Token and at least one Allowed Telegram Chat ID first.",
        },
        { status: 400 }
      );
    }
    const res = await sendTelegramMessage(msg.telegramBotToken, chatId, text);
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, channel: "telegram", sentTo: chatId });
  }

  const toNumber = msg.allowedWhatsappNumbers[0];
  if (!msg.whatsappPhoneNumberId || !msg.whatsappAccessToken || !toNumber) {
    return NextResponse.json(
      {
        error:
          "Configure WhatsApp Phone Number ID, Access Token, and at least one Allowed WhatsApp Number first.",
      },
      { status: 400 }
    );
  }
  const res = await sendWhatsappMessage(
    msg.whatsappPhoneNumberId,
    msg.whatsappAccessToken,
    toNumber,
    text
  );
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, channel: "whatsapp", sentTo: toNumber });
}

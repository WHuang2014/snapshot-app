import { NextResponse } from "next/server";
import {
  executeChannelCommand,
  sendTelegramMessage,
} from "@/lib/messaging-channels";
import { readStore } from "@/lib/store";

export async function POST(req: Request) {
  const store = readStore();
  const msg = store.settings.messaging;

  if (!msg.telegramBotToken) {
    return NextResponse.json(
      { error: "Telegram bot token not configured" },
      { status: 503 }
    );
  }

  // Verify webhook secret token if configured
  if (msg.telegramWebhookSecret) {
    const headerSecret = req.headers.get("x-telegram-bot-api-secret-token");
    if (headerSecret !== msg.telegramWebhookSecret) {
      return NextResponse.json({ error: "Unauthorized webhook secret" }, { status: 401 });
    }
  }

  const update = (await req.json()) as {
    message?: {
      chat?: { id?: number | string };
      text?: string;
    };
  };

  const chatId = update.message?.chat?.id
    ? String(update.message.chat.id)
    : null;
  const text = update.message?.text ?? "";

  if (!chatId || !text) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Enforce sender allowlist when configured
  if (
    msg.allowedTelegramChatIds.length > 0 &&
    !msg.allowedTelegramChatIds.includes(chatId)
  ) {
    await sendTelegramMessage(
      msg.telegramBotToken,
      chatId,
      "Unauthorized Chat ID. Add your Chat ID to Allowed Telegram Chat IDs in SNAPSHOT Setup Wizard."
    );
    return NextResponse.json({ ok: false, error: "Unauthorized chat ID" }, { status: 403 });
  }

  const reply = await executeChannelCommand(text);
  await sendTelegramMessage(msg.telegramBotToken, chatId, reply);

  return NextResponse.json({ ok: true });
}

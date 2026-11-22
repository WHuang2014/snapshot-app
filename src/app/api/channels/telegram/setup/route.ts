import { NextResponse } from "next/server";
import { readStore } from "@/lib/store";

export async function POST(req: Request) {
  const store = readStore();
  const msg = store.settings.messaging;

  if (!msg.telegramBotToken) {
    return NextResponse.json(
      { error: "Save your Telegram Bot Token first." },
      { status: 400 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    publicOrigin?: string;
  };
  const origin = body.publicOrigin?.trim() || new URL(req.url).origin;
  const webhookUrl = `${origin}/api/channels/telegram/webhook`;

  const payload: Record<string, string> = { url: webhookUrl };
  if (msg.telegramWebhookSecret) {
    payload.secret_token = msg.telegramWebhookSecret;
  }

  const res = await fetch(
    `https://api.telegram.org/bot${encodeURIComponent(
      msg.telegramBotToken
    )}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  const data = (await res.json()) as { ok: boolean; description?: string };
  if (!res.ok || !data.ok) {
    return NextResponse.json(
      { error: data.description || "Failed to register Telegram webhook" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    webhookUrl,
    description: data.description || "Webhook registered",
  });
}

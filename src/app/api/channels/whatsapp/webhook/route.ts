import { NextResponse } from "next/server";
import {
  executeChannelCommand,
  sendWhatsappMessage,
  verifyWhatsappSignature,
} from "@/lib/messaging-channels";
import { readStore } from "@/lib/store";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const store = readStore();
  const verifyToken = store.settings.messaging.whatsappVerifyToken;

  if (mode === "subscribe" && verifyToken && token === verifyToken) {
    return new Response(challenge || "", { status: 200 });
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const store = readStore();
  const msg = store.settings.messaging;

  if (
    !verifyWhatsappSignature(
      rawBody,
      req.headers.get("x-hub-signature-256"),
      msg.whatsappAppSecret
    )
  ) {
    return NextResponse.json({ error: "Invalid HMAC signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as {
    entry?: {
      changes?: {
        value?: {
          messages?: {
            from?: string;
            text?: { body?: string };
          }[];
        };
      }[];
    }[];
  };

  const message =
    payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  const from = message?.from?.replace(/[^\d]/g, "");
  const text = message?.text?.body ?? "";

  if (!from || !text) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (
    msg.allowedWhatsappNumbers.length > 0 &&
    !msg.allowedWhatsappNumbers.includes(from)
  ) {
    return NextResponse.json({ ok: false, error: "Unauthorized phone number" }, { status: 403 });
  }

  const reply = await executeChannelCommand(text);
  if (msg.whatsappPhoneNumberId && msg.whatsappAccessToken) {
    await sendWhatsappMessage(
      msg.whatsappPhoneNumberId,
      msg.whatsappAccessToken,
      from,
      reply
    );
  }

  return NextResponse.json({ ok: true });
}

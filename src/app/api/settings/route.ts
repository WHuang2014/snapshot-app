import { NextResponse } from "next/server";
import {
  readStore,
  sanitizeSettingsForClient,
  writeStore,
} from "@/lib/store";
import type { LlmProvider } from "@/lib/types";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    googleClientId?: string;
    googleClientSecret?: string;
    microsoftClientId?: string;
    microsoftClientSecret?: string;
    microsoftTenantId?: string;
    githubToken?: string;
    githubUsername?: string;
    localAllowlistPaths?: string[];
    llmProvider?: LlmProvider;
    llmApiKey?: string;
    sandboxEnabled?: boolean;
    messaging?: {
      telegramBotToken?: string;
      telegramBotUsername?: string;
      telegramWebhookSecret?: string;
      allowedTelegramChatIds?: string[];
      whatsappPhoneNumberId?: string;
      whatsappAccessToken?: string;
      whatsappVerifyToken?: string;
      whatsappAppSecret?: string;
      whatsappBusinessNumber?: string;
      allowedWhatsappNumbers?: string[];
    };
  };

  const store = readStore();
  const s = store.settings;

  if (body.googleClientId !== undefined)
    s.googleClientId = body.googleClientId.trim();
  if (body.googleClientSecret && !body.googleClientSecret.includes("••••")) {
    s.googleClientSecret = body.googleClientSecret.trim();
  }
  if (body.microsoftClientId !== undefined)
    s.microsoftClientId = body.microsoftClientId.trim();
  if (
    body.microsoftClientSecret &&
    !body.microsoftClientSecret.includes("••••")
  ) {
    s.microsoftClientSecret = body.microsoftClientSecret.trim();
  }
  if (body.microsoftTenantId !== undefined)
    s.microsoftTenantId = body.microsoftTenantId.trim() || "common";
  if (body.githubToken !== undefined && !body.githubToken.includes("••••")) {
    s.githubToken = body.githubToken.trim();
  }
  if (body.githubUsername !== undefined)
    s.githubUsername = body.githubUsername.trim();
  if (body.localAllowlistPaths !== undefined) {
    s.localAllowlistPaths = body.localAllowlistPaths
      .map((p) => p.trim())
      .filter(Boolean);
  }
  if (body.llmProvider !== undefined) s.llmProvider = body.llmProvider;
  if (body.llmApiKey !== undefined && !body.llmApiKey.includes("••••")) {
    s.llmApiKey = body.llmApiKey.trim();
  }
  if (body.sandboxEnabled !== undefined) {
    s.sandboxEnabled = body.sandboxEnabled;
  }

  if (body.messaging) {
    const m = body.messaging;
    if (m.telegramBotToken !== undefined && !m.telegramBotToken.includes("••••")) {
      s.messaging.telegramBotToken = m.telegramBotToken.trim();
    }
    if (m.telegramBotUsername !== undefined) {
      s.messaging.telegramBotUsername = m.telegramBotUsername.trim().replace(/^@/, "");
    }
    if (
      m.telegramWebhookSecret !== undefined &&
      !m.telegramWebhookSecret.includes("••••")
    ) {
      s.messaging.telegramWebhookSecret = m.telegramWebhookSecret.trim();
    }
    if (m.allowedTelegramChatIds !== undefined) {
      s.messaging.allowedTelegramChatIds = m.allowedTelegramChatIds
        .map((x) => x.trim())
        .filter(Boolean);
    }
    if (m.whatsappPhoneNumberId !== undefined) {
      s.messaging.whatsappPhoneNumberId = m.whatsappPhoneNumberId.trim();
    }
    if (
      m.whatsappAccessToken !== undefined &&
      !m.whatsappAccessToken.includes("••••")
    ) {
      s.messaging.whatsappAccessToken = m.whatsappAccessToken.trim();
    }
    if (m.whatsappVerifyToken !== undefined) {
      s.messaging.whatsappVerifyToken = m.whatsappVerifyToken.trim();
    }
    if (
      m.whatsappAppSecret !== undefined &&
      !m.whatsappAppSecret.includes("••••")
    ) {
      s.messaging.whatsappAppSecret = m.whatsappAppSecret.trim();
    }
    if (m.whatsappBusinessNumber !== undefined) {
      s.messaging.whatsappBusinessNumber = m.whatsappBusinessNumber
        .trim()
        .replace(/[^\d]/g, "");
    }
    if (m.allowedWhatsappNumbers !== undefined) {
      s.messaging.allowedWhatsappNumbers = m.allowedWhatsappNumbers
        .map((x) => x.trim().replace(/[^\d]/g, ""))
        .filter(Boolean);
    }
  }

  writeStore(store);

  return NextResponse.json({
    ok: true,
    settings: sanitizeSettingsForClient(store.settings),
  });
}

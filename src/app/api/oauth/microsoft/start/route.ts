import { NextResponse } from "next/server";
import { buildMicrosoftAuthUrl } from "@/lib/oauth-helpers";
import { readStore } from "@/lib/store";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const store = readStore();

  if (
    !store.settings.microsoftClientId ||
    !store.settings.microsoftClientSecret
  ) {
    return NextResponse.redirect(
      new URL("/?tab=setup&oauthError=missing_microsoft_credentials", url.origin)
    );
  }

  const authUrl = buildMicrosoftAuthUrl(store.settings, url.origin);
  return NextResponse.redirect(authUrl);
}

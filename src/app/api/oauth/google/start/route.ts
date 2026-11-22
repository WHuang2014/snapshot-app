import { NextResponse } from "next/server";
import { buildGoogleAuthUrl } from "@/lib/oauth-helpers";
import { readStore } from "@/lib/store";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const service = url.searchParams.get("service") === "gdrive" ? "gdrive" : "gmail";
  const store = readStore();

  if (!store.settings.googleClientId || !store.settings.googleClientSecret) {
    return NextResponse.redirect(
      new URL("/?tab=setup&oauthError=missing_google_credentials", url.origin)
    );
  }

  const authUrl = buildGoogleAuthUrl(store.settings, url.origin, service);
  return NextResponse.redirect(authUrl);
}

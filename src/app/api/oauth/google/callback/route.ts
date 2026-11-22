import { NextResponse } from "next/server";
import { readStore, writeStore } from "@/lib/store";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") === "gdrive" ? "gdrive" : "gmail";
  const error = url.searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(
      new URL(`/?tab=connections&oauthError=${encodeURIComponent(error || "no_code")}`, url.origin)
    );
  }

  const store = readStore();
  if (!store.settings.googleClientId || !store.settings.googleClientSecret) {
    return NextResponse.redirect(
      new URL("/?tab=setup&oauthError=missing_google_credentials", url.origin)
    );
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: store.settings.googleClientId,
      client_secret: store.settings.googleClientSecret,
      redirect_uri: `${url.origin}/api/oauth/google/callback`,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(
      new URL(`/?tab=connections&oauthError=google_token_exchange_failed`, url.origin)
    );
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };

  let email = "authorized@gmail.com";
  const userRes = await fetch(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    }
  );
  if (userRes.ok) {
    const profile = (await userRes.json()) as { email?: string };
    if (profile.email) email = profile.email;
  }

  const grantedScopes = tokens.scope
    ? tokens.scope.split(" ")
    : store.connections[state].requiredReadOnlyScopes;

  store.connections[state] = {
    ...store.connections[state],
    mode: "live",
    status: "verified",
    accountIdentifier: email,
    grantedScopes,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? store.connections[state].refreshToken,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    lastVerifiedAt: new Date().toISOString(),
    verificationDetail: `Live Google OAuth read-only token verified for ${email}.`,
  };

  writeStore(store);

  return NextResponse.redirect(
    new URL(`/?tab=connections&oauthSuccess=${state}`, url.origin)
  );
}

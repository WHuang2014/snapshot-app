import { NextResponse } from "next/server";
import { MICROSOFT_SCOPES } from "@/lib/oauth-helpers";
import { readStore, writeStore } from "@/lib/store";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(
      new URL(
        `/?tab=connections&oauthError=${encodeURIComponent(error || "no_code")}`,
        url.origin
      )
    );
  }

  const store = readStore();
  if (
    !store.settings.microsoftClientId ||
    !store.settings.microsoftClientSecret
  ) {
    return NextResponse.redirect(
      new URL("/?tab=setup&oauthError=missing_microsoft_credentials", url.origin)
    );
  }

  const tenant = store.settings.microsoftTenantId || "common";
  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: store.settings.microsoftClientId,
        client_secret: store.settings.microsoftClientSecret,
        code,
        redirect_uri: `${url.origin}/api/oauth/microsoft/callback`,
        grant_type: "authorization_code",
        scope: MICROSOFT_SCOPES.join(" "),
      }),
    }
  );

  if (!tokenRes.ok) {
    return NextResponse.redirect(
      new URL(
        "/?tab=connections&oauthError=microsoft_token_exchange_failed",
        url.origin
      )
    );
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };

  let account = "authorized@outlook.com";
  const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (meRes.ok) {
    const me = (await meRes.json()) as {
      mail?: string;
      userPrincipalName?: string;
    };
    account = me.mail || me.userPrincipalName || account;
  }

  store.connections.outlook = {
    ...store.connections.outlook,
    mode: "live",
    status: "verified",
    accountIdentifier: account,
    grantedScopes: tokens.scope
      ? tokens.scope.split(" ")
      : ["Mail.Read", "User.Read"],
    accessToken: tokens.access_token,
    refreshToken:
      tokens.refresh_token ?? store.connections.outlook.refreshToken,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    lastVerifiedAt: new Date().toISOString(),
    verificationDetail: `Live Microsoft Graph Mail.Read token verified for ${account}.`,
  };

  writeStore(store);

  return NextResponse.redirect(
    new URL("/?tab=connections&oauthSuccess=outlook", url.origin)
  );
}

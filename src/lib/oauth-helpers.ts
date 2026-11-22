import type { AppSettings, SourceConnection } from "./types";

export const GOOGLE_GMAIL_SCOPE =
  "https://www.googleapis.com/auth/gmail.readonly";
export const GOOGLE_DRIVE_SCOPE =
  "https://www.googleapis.com/auth/drive.readonly";
export const GOOGLE_EMAIL_SCOPE =
  "https://www.googleapis.com/auth/userinfo.email";

export const MICROSOFT_SCOPES = ["offline_access", "User.Read", "Mail.Read"];

export function buildGoogleAuthUrl(
  settings: AppSettings,
  origin: string,
  service: "gmail" | "gdrive"
): string {
  const scopes = [GOOGLE_EMAIL_SCOPE];
  if (service === "gmail") {
    scopes.push(GOOGLE_GMAIL_SCOPE);
  } else {
    scopes.push(GOOGLE_DRIVE_SCOPE);
  }

  const params = new URLSearchParams({
    client_id: settings.googleClientId,
    redirect_uri: `${origin}/api/oauth/google/callback`,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
    state: service,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function buildMicrosoftAuthUrl(
  settings: AppSettings,
  origin: string
): string {
  const tenant = settings.microsoftTenantId || "common";
  const params = new URLSearchParams({
    client_id: settings.microsoftClientId,
    response_type: "code",
    redirect_uri: `${origin}/api/oauth/microsoft/callback`,
    response_mode: "query",
    scope: MICROSOFT_SCOPES.join(" "),
    prompt: "consent",
    state: "outlook",
  });

  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params.toString()}`;
}

export async function refreshGoogleAccessToken(
  connection: SourceConnection,
  settings: AppSettings
): Promise<SourceConnection> {
  if (
    !connection.refreshToken ||
    !settings.googleClientId ||
    !settings.googleClientSecret
  ) {
    return connection;
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: settings.googleClientId,
      client_secret: settings.googleClientSecret,
      refresh_token: connection.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    return {
      ...connection,
      status: "expired",
      verificationDetail: `Google token refresh failed (${res.status}). Re-authorize OAuth.`,
    };
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
    scope?: string;
  };

  return {
    ...connection,
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    grantedScopes: data.scope
      ? data.scope.split(" ")
      : connection.grantedScopes,
    status: "verified",
  };
}

export async function refreshMicrosoftAccessToken(
  connection: SourceConnection,
  settings: AppSettings
): Promise<SourceConnection> {
  if (
    !connection.refreshToken ||
    !settings.microsoftClientId ||
    !settings.microsoftClientSecret
  ) {
    return connection;
  }

  const tenant = settings.microsoftTenantId || "common";
  const res = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: settings.microsoftClientId,
        client_secret: settings.microsoftClientSecret,
        refresh_token: connection.refreshToken,
        grant_type: "refresh_token",
        scope: MICROSOFT_SCOPES.join(" "),
      }),
    }
  );

  if (!res.ok) {
    return {
      ...connection,
      status: "expired",
      verificationDetail: `Microsoft token refresh failed (${res.status}). Re-authorize OAuth.`,
    };
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };

  return {
    ...connection,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? connection.refreshToken,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    grantedScopes: data.scope
      ? data.scope.split(" ")
      : connection.grantedScopes,
    status: "verified",
  };
}

export async function verifyGoogleTokenLive(
  connection: SourceConnection,
  settings: AppSettings
): Promise<SourceConnection> {
  let current = connection;
  if (
    current.expiresAt &&
    new Date(current.expiresAt).getTime() < Date.now() + 60_000
  ) {
    current = await refreshGoogleAccessToken(current, settings);
  }

  if (!current.accessToken) {
    return {
      ...current,
      status: "unconfigured",
      lastVerifiedAt: new Date().toISOString(),
      verificationDetail: "No live Google access token stored.",
    };
  }

  const infoRes = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(
      current.accessToken
    )}`
  );

  if (!infoRes.ok) {
    const refreshed = await refreshGoogleAccessToken(current, settings);
    if (refreshed.status === "expired") {
      return { ...refreshed, lastVerifiedAt: new Date().toISOString() };
    }
    current = refreshed;
  } else {
    const info = (await infoRes.json()) as {
      email?: string;
      scope?: string;
      expires_in?: string;
    };
    const scopes = info.scope ? info.scope.split(" ") : current.grantedScopes;
    const missingRequired = current.requiredReadOnlyScopes.filter(
      (req) => !scopes.includes(req)
    );
    return {
      ...current,
      accountIdentifier: info.email ?? current.accountIdentifier,
      grantedScopes: scopes,
      status: missingRequired.length === 0 ? "verified" : "revoked",
      lastVerifiedAt: new Date().toISOString(),
      verificationDetail:
        missingRequired.length === 0
          ? `Live Google OAuth token verified (${info.expires_in ?? "?"}s remaining).`
          : `Missing required read-only scope: ${missingRequired.join(", ")}`,
    };
  }

  return {
    ...current,
    lastVerifiedAt: new Date().toISOString(),
    verificationDetail: "Live Google OAuth token refreshed & verified.",
  };
}

export async function verifyMicrosoftTokenLive(
  connection: SourceConnection,
  settings: AppSettings
): Promise<SourceConnection> {
  let current = connection;
  if (
    current.expiresAt &&
    new Date(current.expiresAt).getTime() < Date.now() + 60_000
  ) {
    current = await refreshMicrosoftAccessToken(current, settings);
  }

  if (!current.accessToken) {
    return {
      ...current,
      status: "unconfigured",
      lastVerifiedAt: new Date().toISOString(),
      verificationDetail: "No live Microsoft access token stored.",
    };
  }

  const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${current.accessToken}` },
  });

  if (!meRes.ok) {
    return {
      ...current,
      status: "expired",
      lastVerifiedAt: new Date().toISOString(),
      verificationDetail: `Microsoft Graph /me returned HTTP ${meRes.status}. Re-authorize.`,
    };
  }

  const me = (await meRes.json()) as {
    mail?: string;
    userPrincipalName?: string;
  };
  return {
    ...current,
    accountIdentifier:
      me.mail || me.userPrincipalName || current.accountIdentifier,
    status: "verified",
    lastVerifiedAt: new Date().toISOString(),
    verificationDetail:
      "Live Microsoft Graph Mail.Read token verified via /v1.0/me.",
  };
}

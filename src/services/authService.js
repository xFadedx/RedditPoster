import { createHash, randomBytes, randomUUID } from "node:crypto";

import { getIntegrationsRecord, getProviderRecord, updateProviderRecord } from "./integrationStorageService.js";
import { createHttpError } from "../utils/validation.js";

const REDDIT_AUTHORIZE_URL = "https://www.reddit.com/api/v1/authorize";
const REDDIT_TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const REDDIT_API_BASE_URL = "https://oauth.reddit.com";
const TWITTER_AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
const TWITTER_TOKEN_URL = "https://api.x.com/2/oauth2/token";
const TWITTER_API_BASE_URL = "https://api.x.com/2";
const pendingAuthStates = new Map();

function nowIso() {
  return new Date().toISOString();
}

function toBase64Url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createPkcePair() {
  const verifier = toBase64Url(randomBytes(48));
  const challenge = toBase64Url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function getAppBaseUrl(request) {
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL.replace(/\/$/, "");
  }

  return `${request.protocol}://${request.get("host")}`;
}

function getRedditRedirectUri(request) {
  return `${getAppBaseUrl(request)}/api/auth/reddit/callback`;
}

function getTwitterRedirectUri(request) {
  return `${getAppBaseUrl(request)}/api/auth/twitter/callback`;
}

function getRedditScope() {
  return "identity submit";
}

function getTwitterScope() {
  return "tweet.read tweet.write users.read offline.access";
}

function getRedditUserAgent() {
  return process.env.REDDIT_USER_AGENT || "marketing-agent/1.0";
}

function getRedditCredentials() {
  const clientId = String(process.env.REDDIT_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.REDDIT_CLIENT_SECRET || "").trim();

  if (!clientId || !clientSecret) {
    throw createHttpError(400, "Set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET in .env before connecting Reddit.");
  }

  return { clientId, clientSecret };
}

function getTwitterCredentials() {
  const clientId = String(process.env.X_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.X_CLIENT_SECRET || "").trim() || null;

  if (!clientId) {
    throw createHttpError(400, "Set X_CLIENT_ID in .env before connecting X.");
  }

  return { clientId, clientSecret };
}

function consumePendingState(provider, state) {
  const pending = pendingAuthStates.get(state);

  if (!pending || pending.provider !== provider) {
    throw createHttpError(400, "This auth session is missing or expired. Start the connection again.");
  }

  pendingAuthStates.delete(state);
  return pending;
}

async function parseApiResponse(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

function buildRedditBasicAuth() {
  const { clientId, clientSecret } = getRedditCredentials();
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

function buildTwitterBasicAuth() {
  const { clientId, clientSecret } = getTwitterCredentials();

  if (!clientSecret) {
    return null;
  }

  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

function sanitizeConnection(connection) {
  if (!connection) {
    return {
      connected: false
    };
  }

  return {
    connected: true,
    username: connection.username || null,
    displayName: connection.displayName || null,
    userId: connection.userId || null,
    scope: connection.scope || null,
    expiresAt: connection.expiresAt || null,
    updatedAt: connection.updatedAt || null
  };
}

function buildCompletionHtml(providerLabel, accountLabel) {
  const safeProvider = providerLabel.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeAccount = accountLabel.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${safeProvider} connected</title>
    <style>
      body { font-family: Segoe UI, sans-serif; background: #f5f1ea; color: #18302b; display: grid; place-items: center; min-height: 100vh; margin: 0; }
      .card { background: white; padding: 24px 28px; border-radius: 18px; box-shadow: 0 20px 50px rgba(0,0,0,0.12); max-width: 420px; }
      h1 { margin: 0 0 12px; font-size: 24px; }
      p { margin: 0; line-height: 1.6; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${safeProvider} connected</h1>
      <p>Signed in as ${safeAccount}. You can close this window.</p>
    </div>
    <script>
      if (window.opener && !window.opener.closed) {
        try {
          window.opener.postMessage({ type: "marketing-agent-auth-complete" }, window.location.origin);
        } catch (error) {
          window.opener.location.reload();
        }
      }
      setTimeout(() => window.close(), 700);
      setTimeout(() => { window.location.href = "/"; }, 1200);
    </script>
  </body>
</html>`;
}

async function fetchRedditIdentity(accessToken) {
  const response = await fetch(`${REDDIT_API_BASE_URL}/api/v1/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": getRedditUserAgent()
    }
  });

  const payload = await parseApiResponse(response);

  if (!response.ok) {
    throw createHttpError(502, `Reddit identity lookup failed: ${typeof payload === "string" ? payload : JSON.stringify(payload)}`);
  }

  return payload;
}

async function fetchTwitterIdentity(accessToken) {
  const response = await fetch(`${TWITTER_API_BASE_URL}/users/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  const payload = await parseApiResponse(response);

  if (!response.ok) {
    throw createHttpError(502, `X account lookup failed: ${typeof payload === "string" ? payload : JSON.stringify(payload)}`);
  }

  return payload.data;
}

export async function getIntegrationStatus() {
  const record = await getIntegrationsRecord();
  return {
    reddit: sanitizeConnection(record.reddit),
    twitter: sanitizeConnection(record.twitter)
  };
}

export function createRedditAuthUrl(request) {
  const { clientId } = getRedditCredentials();
  const redirectUri = getRedditRedirectUri(request);
  const state = randomUUID();

  pendingAuthStates.set(state, {
    provider: "reddit",
    redirectUri,
    createdAt: Date.now()
  });

  const url = new URL(REDDIT_AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("duration", "permanent");
  url.searchParams.set("scope", getRedditScope());

  return url.toString();
}

export async function completeRedditAuth(request) {
  const error = String(request.query.error || "").trim();

  if (error) {
    throw createHttpError(400, `Reddit authorization failed: ${error}`);
  }

  const code = String(request.query.code || "").trim();
  const state = String(request.query.state || "").trim();

  if (!code || !state) {
    throw createHttpError(400, "Reddit callback is missing the authorization code.");
  }

  const pending = consumePendingState("reddit", state);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: pending.redirectUri
  });

  const tokenResponse = await fetch(REDDIT_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: buildRedditBasicAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": getRedditUserAgent()
    },
    body
  });

  const tokenPayload = await parseApiResponse(tokenResponse);

  if (!tokenResponse.ok) {
    throw createHttpError(502, `Reddit token exchange failed: ${typeof tokenPayload === "string" ? tokenPayload : JSON.stringify(tokenPayload)}`);
  }

  const profile = await fetchRedditIdentity(tokenPayload.access_token);
  await updateProviderRecord("reddit", () => ({
    username: profile.name,
    displayName: profile.name,
    userId: profile.sub || profile.id || profile.name,
    accessToken: tokenPayload.access_token,
    refreshToken: tokenPayload.refresh_token || null,
    scope: tokenPayload.scope || getRedditScope(),
    expiresAt: new Date(Date.now() + Number(tokenPayload.expires_in || 3600) * 1000).toISOString(),
    updatedAt: nowIso()
  }));

  return {
    providerLabel: "Reddit",
    accountLabel: profile.name
  };
}

export function createTwitterAuthUrl(request) {
  const { clientId } = getTwitterCredentials();
  const redirectUri = getTwitterRedirectUri(request);
  const state = randomUUID();
  const pkce = createPkcePair();

  pendingAuthStates.set(state, {
    provider: "twitter",
    redirectUri,
    codeVerifier: pkce.verifier,
    createdAt: Date.now()
  });

  const url = new URL(TWITTER_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", getTwitterScope());
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", pkce.challenge);
  url.searchParams.set("code_challenge_method", "S256");

  return url.toString();
}

function buildTwitterTokenRequestHeaders() {
  const authHeader = buildTwitterBasicAuth();
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded"
  };

  if (authHeader) {
    headers.Authorization = authHeader;
  }

  return headers;
}

function appendTwitterClient(body) {
  const { clientId, clientSecret } = getTwitterCredentials();

  if (!clientSecret) {
    body.set("client_id", clientId);
  }
}

export async function completeTwitterAuth(request) {
  const error = String(request.query.error || "").trim();

  if (error) {
    throw createHttpError(400, `X authorization failed: ${error}`);
  }

  const code = String(request.query.code || "").trim();
  const state = String(request.query.state || "").trim();

  if (!code || !state) {
    throw createHttpError(400, "X callback is missing the authorization code.");
  }

  const pending = consumePendingState("twitter", state);
  const body = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    redirect_uri: pending.redirectUri,
    code_verifier: pending.codeVerifier
  });
  appendTwitterClient(body);

  const tokenResponse = await fetch(TWITTER_TOKEN_URL, {
    method: "POST",
    headers: buildTwitterTokenRequestHeaders(),
    body
  });

  const tokenPayload = await parseApiResponse(tokenResponse);

  if (!tokenResponse.ok) {
    throw createHttpError(502, `X token exchange failed: ${typeof tokenPayload === "string" ? tokenPayload : JSON.stringify(tokenPayload)}`);
  }

  const profile = await fetchTwitterIdentity(tokenPayload.access_token);
  await updateProviderRecord("twitter", () => ({
    username: profile.username,
    displayName: profile.name || profile.username,
    userId: profile.id,
    accessToken: tokenPayload.access_token,
    refreshToken: tokenPayload.refresh_token || null,
    scope: tokenPayload.scope || getTwitterScope(),
    expiresAt: new Date(Date.now() + Number(tokenPayload.expires_in || 7200) * 1000).toISOString(),
    updatedAt: nowIso()
  }));

  return {
    providerLabel: "X",
    accountLabel: `@${profile.username}`
  };
}

export async function getRedditAccessToken() {
  const connection = await getProviderRecord("reddit");

  if (!connection?.accessToken) {
    throw createHttpError(400, "Connect Reddit first.");
  }

  const expiresAt = new Date(connection.expiresAt || 0).getTime();
  if (expiresAt && expiresAt - Date.now() > 60_000) {
    return connection.accessToken;
  }

  if (!connection.refreshToken) {
    throw createHttpError(400, "Reconnect Reddit to refresh the access token.");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: connection.refreshToken
  });

  const tokenResponse = await fetch(REDDIT_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: buildRedditBasicAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": getRedditUserAgent()
    },
    body
  });

  const tokenPayload = await parseApiResponse(tokenResponse);

  if (!tokenResponse.ok) {
    throw createHttpError(502, `Reddit token refresh failed: ${typeof tokenPayload === "string" ? tokenPayload : JSON.stringify(tokenPayload)}`);
  }

  const refreshed = await updateProviderRecord("reddit", (current) => ({
    ...current,
    accessToken: tokenPayload.access_token,
    scope: tokenPayload.scope || current.scope,
    expiresAt: new Date(Date.now() + Number(tokenPayload.expires_in || 3600) * 1000).toISOString(),
    updatedAt: nowIso()
  }));

  return refreshed.accessToken;
}

export async function getTwitterAccessToken() {
  const connection = await getProviderRecord("twitter");

  if (!connection?.accessToken) {
    throw createHttpError(400, "Connect X first.");
  }

  const expiresAt = new Date(connection.expiresAt || 0).getTime();
  if (expiresAt && expiresAt - Date.now() > 60_000) {
    return connection.accessToken;
  }

  if (!connection.refreshToken) {
    throw createHttpError(400, "Reconnect X to refresh the access token.");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: connection.refreshToken
  });
  appendTwitterClient(body);

  const tokenResponse = await fetch(TWITTER_TOKEN_URL, {
    method: "POST",
    headers: buildTwitterTokenRequestHeaders(),
    body
  });

  const tokenPayload = await parseApiResponse(tokenResponse);

  if (!tokenResponse.ok) {
    throw createHttpError(502, `X token refresh failed: ${typeof tokenPayload === "string" ? tokenPayload : JSON.stringify(tokenPayload)}`);
  }

  const refreshed = await updateProviderRecord("twitter", (current) => ({
    ...current,
    accessToken: tokenPayload.access_token,
    refreshToken: tokenPayload.refresh_token || current.refreshToken,
    scope: tokenPayload.scope || current.scope,
    expiresAt: new Date(Date.now() + Number(tokenPayload.expires_in || 7200) * 1000).toISOString(),
    updatedAt: nowIso()
  }));

  return refreshed.accessToken;
}

export async function renderAuthCompletion(provider, request) {
  const result = provider === "reddit"
    ? await completeRedditAuth(request)
    : await completeTwitterAuth(request);

  return buildCompletionHtml(result.providerLabel, result.accountLabel);
}

import { detectGender, type Gender } from "./gender.js";

const BASE_URL = "https://www.instagram.com";
const API_URL = `${BASE_URL}/api/v1`;

const BASE_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Connection: "keep-alive",
  DNT: "1",
  Origin: BASE_URL,
  Referer: `${BASE_URL}/`,
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
  "X-Requested-With": "XMLHttpRequest",
  "X-IG-App-ID": "936619743392459",
  "X-IG-WWW-Claim": "0",
  "X-ASBD-ID": "129477",
};

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

function parseCookies(cookieHeaders: string[]): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const header of cookieHeaders) {
    const pair = header.split(";")[0].trim();
    const idx = pair.indexOf("=");
    if (idx > 0) {
      cookies[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
    }
  }
  return cookies;
}

function serializeCookies(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function mergeCookies(
  existing: Record<string, string>,
  incoming: string[],
): Record<string, string> {
  return { ...existing, ...parseCookies(incoming) };
}

// ---------------------------------------------------------------------------
// Session — mirrors Python requests.Session: accumulates cookies across every
// redirect hop so that csrftoken set on a 302 is not lost.
// ---------------------------------------------------------------------------

class InstagramSession {
  cookies: Record<string, string> = {};

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const cookieStr = serializeCookies(this.cookies);
    return {
      ...BASE_HEADERS,
      ...(cookieStr ? { Cookie: cookieStr } : {}),
      ...extra,
    };
  }

  /** GET with manual redirect following so every hop's Set-Cookie is captured. */
  async get(
    url: string,
    extra: Record<string, string> = {},
  ): Promise<Response> {
    let current = url;
    let hops = 0;
    let lastResp!: Response;

    while (hops++ < 15) {
      const resp = await fetch(current, {
        headers: this.headers(extra),
        redirect: "manual",
      });

      // Accumulate cookies from this hop
      const setCookies = resp.headers.getSetCookie?.() ?? [];
      this.cookies = mergeCookies(this.cookies, setCookies);

      if (resp.status >= 300 && resp.status < 400) {
        const location = resp.headers.get("location");
        if (!location) break;
        current = location.startsWith("http")
          ? location
          : new URL(location, current).href;
        continue;
      }

      lastResp = resp;
      break;
    }

    return lastResp;
  }

  /** POST — single shot, no redirects needed. */
  async post(
    url: string,
    body: string,
    extra: Record<string, string> = {},
  ): Promise<Response> {
    const resp = await fetch(url, {
      method: "POST",
      headers: this.headers(extra),
      body,
      redirect: "manual",
    });

    const setCookies = resp.headers.getSetCookie?.() ?? [];
    this.cookies = mergeCookies(this.cookies, setCookies);

    return resp;
  }

  get csrfToken(): string | undefined {
    return this.cookies["csrftoken"];
  }

  get sessionId(): string | undefined {
    return this.cookies["sessionid"];
  }

  get userId(): string {
    return this.cookies["ds_user_id"] ?? "";
  }
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface InstagramSession_ {
  cookies: Record<string, string>;
  userId: string;
  username: string;
}

export interface LoginResult {
  success: boolean;
  session?: InstagramSession_;
  requiresTwoFactor?: boolean;
  twoFactorIdentifier?: string;
  error?: string;
}

export interface FollowerData {
  userId: string;
  username: string;
  fullName?: string;
  profilePicUrl?: string;
  gender: Gender;
  followedByViewer: boolean;
  isPrivate?: boolean;
  isVerified?: boolean;
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export async function instagramLogin(
  username: string,
  password: string,
  twoFactorCode?: string,
): Promise<LoginResult> {
  try {
    const session = new InstagramSession();

    // Step 1: GET login page — accumulates csrftoken across all redirect hops
    await session.get(`${BASE_URL}/accounts/login/`);

    const csrfToken = session.csrfToken;
    if (!csrfToken) {
      return {
        success: false,
        error: "Could not get CSRF token from Instagram",
      };
    }

    // Step 2: POST login
    const loginPayload = new URLSearchParams({
      username,
      enc_password: `#PWD_INSTAGRAM_BROWSER:0:${Math.floor(Date.now() / 1000)}:${encodeURIComponent(password)}`,
      queryParams: "{}",
      optIntoOneTap: "false",
      trustedDeviceRecords: "{}",
    });

    const loginResp = await session.post(
      `${BASE_URL}/api/v1/web/accounts/login/ajax/`,
      loginPayload.toString(),
      {
        "X-CSRFToken": csrfToken,
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Instagram-AJAX": "1007616494",
        Referer: `${BASE_URL}/accounts/login/`,
      },
    );

    let loginData: Record<string, unknown>;
    try {
      loginData = (await loginResp.json()) as Record<string, unknown>;
    } catch {
      return { success: false, error: "Invalid response from Instagram" };
    }

    // Handle 2FA
    if (loginData["two_factor_required"]) {
      const twoFactorInfo = loginData["two_factor_info"] as
        | Record<string, string>
        | undefined;

      if (!twoFactorCode) {
        return {
          success: false,
          requiresTwoFactor: true,
          twoFactorIdentifier: twoFactorInfo?.["two_factor_identifier"],
          error: "Two-factor authentication required",
        };
      }

      const tfaPayload = new URLSearchParams({
        username,
        verificationCode: twoFactorCode,
        identifier: twoFactorInfo?.["two_factor_identifier"] ?? "",
        queryParams: JSON.stringify({ next: "/" }),
        trustThisDevice: "1",
        twoFactorIdentifier: twoFactorInfo?.["two_factor_identifier"] ?? "",
        verificationMethod: "3",
      });

      const updatedCsrf = session.csrfToken ?? csrfToken;
      const tfaResp = await session.post(
        `${BASE_URL}/api/v1/web/accounts/login/two_factor/`,
        tfaPayload.toString(),
        {
          "X-CSRFToken": updatedCsrf,
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: `${BASE_URL}/accounts/login/two_factor`,
        },
      );

      let tfaData: Record<string, unknown>;
      try {
        tfaData = (await tfaResp.json()) as Record<string, unknown>;
      } catch {
        return { success: false, error: "Invalid 2FA response from Instagram" };
      }

      if (!tfaData["authenticated"]) {
        return {
          success: false,
          error: (tfaData["message"] as string) ?? "2FA verification failed",
        };
      }
    } else if (!loginData["authenticated"]) {
      const msg =
        (loginData["message"] as string) ??
        (loginData["error_type"] as string) ??
        "Login failed";
      return { success: false, error: msg };
    }

    // Step 3: GET home page to finalize session cookies (sessionid, ds_user_id)
    await session.get(`${BASE_URL}/`, {
      Referer: `${BASE_URL}/accounts/login/`,
    });

    const sessionId = session.sessionId;
    if (!sessionId) {
      return {
        success: false,
        error: "Login appeared to succeed but no session cookie found",
      };
    }

    return {
      success: true,
      session: {
        cookies: session.cookies,
        userId: session.userId,
        username,
      },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: (err as Error).message ?? "Unknown error during login",
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers for authenticated requests
// ---------------------------------------------------------------------------

function buildCookieHeader(sessionId: string, userId?: string): string {
  const base: Record<string, string> = { sessionid: sessionId };
  if (userId) base["ds_user_id"] = userId;
  return serializeCookies(base);
}

export async function getInstagramUserId(
  username: string,
  sessionId: string,
  userId?: string,
  csrfToken?: string,
): Promise<string | null> {
  const cookie = buildCookieHeader(sessionId, userId);
  try {
    const resp = await fetch(
      `${BASE_URL}/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
      {
        headers: {
          ...BASE_HEADERS,
          Cookie: cookie,
          ...(csrfToken ? { "X-CSRFToken": csrfToken } : {}),
        },
      },
    );
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      data?: { user?: { id?: string } };
    };
    return data?.data?.user?.id ?? null;
  } catch {
    return null;
  }
}

export interface RawIGUser {
  pk: string;
  username: string;
  full_name?: string;
  profile_pic_url?: string;
  is_private?: boolean;
  is_verified?: boolean;
  followed_by_viewer?: boolean;
  friendship_status?: { following?: boolean };
}

export async function getFollowers(
  username: string,
  sessionId: string,
  userId?: string,
): Promise<{ success: boolean; followers?: FollowerData[]; error?: string }> {
  try {
    const cookie = buildCookieHeader(sessionId, userId);

    const profileUserId = await getInstagramUserId(username, sessionId, userId);
    if (!profileUserId) {
      return {
        success: false,
        error: "Could not find user — account may be private or not exist",
      };
    }

    const resp = await fetch(
      `${API_URL}/friendships/${profileUserId}/followers/?count=100`,
      {
        headers: {
          ...BASE_HEADERS,
          Cookie: cookie,
        },
      },
    );

    if (resp.status === 401 || resp.status === 403) {
      return {
        success: false,
        error: "Session expired or invalid. Please log in again.",
      };
    }

    if (!resp.ok) {
      return { success: false, error: `Instagram API error: ${resp.status}` };
    }

    const data = (await resp.json()) as { users?: RawIGUser[] };
    const users = data?.users ?? [];

    const followers: FollowerData[] = users.map((u) => {
      const firstName = (u.full_name ?? u.username ?? "").split(" ")[0] ?? "";
      return {
        userId: u.pk,
        username: u.username,
        fullName: u.full_name,
        profilePicUrl: u.profile_pic_url,
        gender: detectGender(firstName),
        followedByViewer:
          u.friendship_status?.following ?? u.followed_by_viewer ?? false,
        isPrivate: u.is_private,
        isVerified: u.is_verified,
      };
    });

    return { success: true, followers };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message ?? "Unknown error" };
  }
}

export async function followUser(
  targetUserId: string,
  sessionId: string,
  myUserId?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = new InstagramSession();
    session.cookies = { sessionid: sessionId, ...(myUserId ? { ds_user_id: myUserId } : {}) };

    await session.get(`${BASE_URL}/`);
    const csrfToken = session.csrfToken ?? "";

    const resp = await session.post(
      `${API_URL}/friendships/create/${targetUserId}/`,
      `user_id=${targetUserId}`,
      {
        "X-CSRFToken": csrfToken,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    );

    if (resp.status === 401 || resp.status === 403) {
      return { success: false, error: "Session expired or unauthorized" };
    }

    return { success: resp.ok };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

export async function unfollowUser(
  targetUserId: string,
  sessionId: string,
  myUserId?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = new InstagramSession();
    session.cookies = { sessionid: sessionId, ...(myUserId ? { ds_user_id: myUserId } : {}) };

    await session.get(`${BASE_URL}/`);
    const csrfToken = session.csrfToken ?? "";

    const resp = await session.post(
      `${API_URL}/friendships/destroy/${targetUserId}/`,
      `user_id=${targetUserId}`,
      {
        "X-CSRFToken": csrfToken,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    );

    if (resp.status === 401 || resp.status === 403) {
      return { success: false, error: "Session expired or unauthorized" };
    }

    return { success: resp.ok };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

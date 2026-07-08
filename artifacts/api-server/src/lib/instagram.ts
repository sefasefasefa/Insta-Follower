import { detectGender, type Gender } from "./gender.js";

const BASE_URL = "https://www.instagram.com";
const API_URL = `${BASE_URL}/api/v1`;

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
};

const API_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "X-IG-App-ID": "936619743392459",
  "X-Requested-With": "XMLHttpRequest",
  Origin: BASE_URL,
  Referer: `${BASE_URL}/`,
  "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
};

function parseCookies(cookieHeaders: string[]): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const header of cookieHeaders) {
    const parts = header.split(";")[0].trim();
    const idx = parts.indexOf("=");
    if (idx > 0) {
      cookies[parts.slice(0, idx).trim()] = parts.slice(idx + 1).trim();
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

export interface InstagramSession {
  cookies: Record<string, string>;
  userId: string;
  username: string;
}

export interface LoginResult {
  success: boolean;
  session?: InstagramSession;
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

/** Extract csrftoken from HTML body (Instagram embeds it as "csrf_token":"...") */
function extractCsrfFromHtml(html: string): string | undefined {
  const match = html.match(/"csrf_token"\s*:\s*"([^"]+)"/);
  return match?.[1];
}

export async function instagramLogin(
  username: string,
  password: string,
  twoFactorCode?: string,
): Promise<LoginResult> {
  try {
    let cookies: Record<string, string> = {};

    // Step 1: GET main page first (more reliable for cookies than login page)
    const mainResp = await fetch(`${BASE_URL}/`, {
      headers: DEFAULT_HEADERS,
      redirect: "follow",
    });
    const mainCookieHeaders = mainResp.headers.getSetCookie?.() ?? [];
    cookies = mergeCookies(cookies, mainCookieHeaders);

    // Step 2: GET login page — may set additional cookies
    const initResp = await fetch(`${BASE_URL}/accounts/login/`, {
      headers: {
        ...DEFAULT_HEADERS,
        Referer: `${BASE_URL}/`,
        Cookie: serializeCookies(cookies),
      },
      redirect: "follow",
    });
    const initCookieHeaders = initResp.headers.getSetCookie?.() ?? [];
    cookies = mergeCookies(cookies, initCookieHeaders);

    // Prefer cookie value; fall back to extracting from HTML
    let csrfToken = cookies["csrftoken"];
    if (!csrfToken) {
      try {
        const html = await initResp.text();
        csrfToken = extractCsrfFromHtml(html);
      } catch {
        // ignore parse errors
      }
    }
    // Last resort: try main page HTML
    if (!csrfToken) {
      try {
        const html = await mainResp.clone().text();
        csrfToken = extractCsrfFromHtml(html);
      } catch {
        // ignore
      }
    }

    if (!csrfToken) {
      return { success: false, error: "Could not get CSRF token from Instagram" };
    }

    // Step 3: POST login
    const loginPayload = new URLSearchParams({
      username,
      enc_password: `#PWD_INSTAGRAM_BROWSER:0:${Math.floor(Date.now() / 1000)}:${encodeURIComponent(password)}`,
      queryParams: "{}",
      optIntoOneTap: "false",
      trustedDeviceRecords: "{}",
    });

    const loginResp = await fetch(`${BASE_URL}/api/v1/web/accounts/login/ajax/`, {
      method: "POST",
      headers: {
        ...API_HEADERS,
        "X-CSRFToken": csrfToken,
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: serializeCookies(cookies),
        Referer: `${BASE_URL}/accounts/login/`,
      },
      body: loginPayload.toString(),
      redirect: "manual",
    });

    const loginCookies = loginResp.headers.getSetCookie?.() ?? [];
    cookies = mergeCookies(cookies, loginCookies);

    let loginData: Record<string, unknown>;
    try {
      loginData = (await loginResp.json()) as Record<string, unknown>;
    } catch {
      return { success: false, error: "Invalid response from Instagram" };
    }

    // Handle 2FA
    if (loginData["two_factor_required"]) {
      const twoFactorInfo = loginData["two_factor_info"] as Record<string, string> | undefined;
      if (!twoFactorCode) {
        return {
          success: false,
          requiresTwoFactor: true,
          twoFactorIdentifier: twoFactorInfo?.["two_factor_identifier"],
          error: "Two-factor authentication required",
        };
      }

      // Submit 2FA code
      const tfaPayload = new URLSearchParams({
        username,
        verificationCode: twoFactorCode,
        identifier: twoFactorInfo?.["two_factor_identifier"] ?? "",
        queryParams: JSON.stringify({ next: "/" }),
        trustThisDevice: "1",
        twoFactorIdentifier: twoFactorInfo?.["two_factor_identifier"] ?? "",
        verificationMethod: "3",
      });

      const updatedCsrf = cookies["csrftoken"] ?? csrfToken;
      const tfaResp = await fetch(`${BASE_URL}/api/v1/web/accounts/login/two_factor/`, {
        method: "POST",
        headers: {
          ...API_HEADERS,
          "X-CSRFToken": updatedCsrf,
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: serializeCookies(cookies),
          Referer: `${BASE_URL}/accounts/login/two_factor`,
        },
        body: tfaPayload.toString(),
        redirect: "manual",
      });

      const tfaCookies = tfaResp.headers.getSetCookie?.() ?? [];
      cookies = mergeCookies(cookies, tfaCookies);

      let tfaData: Record<string, unknown>;
      try {
        tfaData = (await tfaResp.json()) as Record<string, unknown>;
      } catch {
        return { success: false, error: "Invalid 2FA response from Instagram" };
      }

      if (!tfaData["authenticated"]) {
        return { success: false, error: (tfaData["message"] as string) ?? "2FA verification failed" };
      }
    } else if (!loginData["authenticated"]) {
      const msg = (loginData["message"] as string) ?? (loginData["error_type"] as string) ?? "Login failed";
      return { success: false, error: msg };
    }

    // Get home page to pick up sessionid cookie
    const homeResp = await fetch(`${BASE_URL}/`, {
      headers: {
        ...API_HEADERS,
        Cookie: serializeCookies(cookies),
        Referer: `${BASE_URL}/accounts/login/`,
      },
      redirect: "follow",
    });
    const homeCookies = homeResp.headers.getSetCookie?.() ?? [];
    cookies = mergeCookies(cookies, homeCookies);

    const sessionId = cookies["sessionid"];
    const userId = cookies["ds_user_id"] ?? "";
    const igUsername = cookies["ig_did"] ?? username; // use login username as fallback

    if (!sessionId) {
      return { success: false, error: "Login appeared to succeed but no session cookie found" };
    }

    return {
      success: true,
      session: {
        cookies,
        userId,
        username,
      },
    };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message ?? "Unknown error during login" };
  }
}

export function buildCookieHeader(sessionId: string, userId?: string): string {
  const base: Record<string, string> = {
    sessionid: sessionId,
  };
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
          ...DEFAULT_HEADERS,
          Cookie: cookie,
          ...(csrfToken ? { "X-CSRFToken": csrfToken } : {}),
        },
      },
    );
    if (!resp.ok) return null;
    const data = (await resp.json()) as { data?: { user?: { id?: string } } };
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

    // First get the profile's userId
    const profileUserId = await getInstagramUserId(username, sessionId, userId);
    if (!profileUserId) {
      return { success: false, error: "Could not find user — account may be private or not exist" };
    }

    const resp = await fetch(
      `${API_URL}/friendships/${profileUserId}/followers/?count=100`,
      {
        headers: {
          ...DEFAULT_HEADERS,
          Cookie: cookie,
        },
      },
    );

    if (resp.status === 401 || resp.status === 403) {
      return { success: false, error: "Session expired or invalid. Please log in again." };
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
        followedByViewer: u.friendship_status?.following ?? u.followed_by_viewer ?? false,
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
    const cookie = buildCookieHeader(sessionId, myUserId);

    // Get CSRF token
    const csrfResp = await fetch(`${BASE_URL}/`, {
      headers: { ...DEFAULT_HEADERS, Cookie: cookie },
    });
    const csrfCookies = parseCookies(csrfResp.headers.getSetCookie?.() ?? []);
    const csrfToken = csrfCookies["csrftoken"] ?? "";

    const resp = await fetch(`${API_URL}/friendships/create/${targetUserId}/`, {
      method: "POST",
      headers: {
        ...DEFAULT_HEADERS,
        Cookie: cookie,
        "X-CSRFToken": csrfToken,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `user_id=${targetUserId}`,
    });

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
    const cookie = buildCookieHeader(sessionId, myUserId);

    const csrfResp = await fetch(`${BASE_URL}/`, {
      headers: { ...DEFAULT_HEADERS, Cookie: cookie },
    });
    const csrfCookies = parseCookies(csrfResp.headers.getSetCookie?.() ?? []);
    const csrfToken = csrfCookies["csrftoken"] ?? "";

    const resp = await fetch(`${API_URL}/friendships/destroy/${targetUserId}/`, {
      method: "POST",
      headers: {
        ...DEFAULT_HEADERS,
        Cookie: cookie,
        "X-CSRFToken": csrfToken,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `user_id=${targetUserId}`,
    });

    if (resp.status === 401 || resp.status === 403) {
      return { success: false, error: "Session expired or unauthorized" };
    }

    return { success: resp.ok };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

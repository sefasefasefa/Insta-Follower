import puppeteer from "puppeteer-core";
import { detectGender, type Gender } from "./gender.js";

const BASE_URL = "https://www.instagram.com";
const API_URL = `${BASE_URL}/api/v1`;

const CHROMIUM_PATH =
  process.env.CHROMIUM_PATH ??
  "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium";

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
// Cookie helpers (for authenticated API calls after login)
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
// Login via headless Chromium (same approach as yenipuller.py / Selenium)
// Instagram blocks plain HTTP from server IPs — real browser is required.
// ---------------------------------------------------------------------------

export async function instagramLogin(
  username: string,
  password: string,
  twoFactorCode?: string,
): Promise<LoginResult> {
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROMIUM_PATH,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-blink-features=AutomationControlled",
        "--disable-infobars",
        "--window-size=1280,720",
      ],
    });

    const page = await browser.newPage();

    // Anti-bot: override user agent and hide automation signals
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    // Navigate to login page
    await page.goto(`${BASE_URL}/accounts/login/`, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    // Fill credentials
    await page.waitForSelector('input[name="username"]', { timeout: 10000 });
    await page.type('input[name="username"]', username, { delay: 50 });
    await page.type('input[name="password"]', password, { delay: 50 });

    // Submit
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {}),
    ]);

    // Give the page a moment to settle
    await new Promise((r) => setTimeout(r, 2000));

    const currentUrl = page.url();

    // Check for 2FA challenge
    const needs2FA =
      currentUrl.includes("two_factor") ||
      currentUrl.includes("challenge") ||
      (await page.$('input[name="verificationCode"]').catch(() => null)) !== null ||
      (await page.$('input[aria-label*="ecurity"]').catch(() => null)) !== null;

    if (needs2FA) {
      if (!twoFactorCode) {
        await browser.close();
        return {
          success: false,
          requiresTwoFactor: true,
          error: "Two-factor authentication required",
        };
      }

      // Enter 2FA code
      const codeInput = await page
        .$('input[name="verificationCode"]')
        .catch(() => null) ??
        await page.$('input[aria-label*="ecurity"]').catch(() => null);

      if (codeInput) {
        await codeInput.type(twoFactorCode, { delay: 50 });
        const submitBtn = await page.$('button[type="submit"]');
        if (submitBtn) {
          await Promise.all([
            submitBtn.click(),
            page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => {}),
          ]);
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }

    // Collect cookies from browser
    const browserCookies = await page.cookies();
    const cookieMap: Record<string, string> = {};
    for (const c of browserCookies) {
      cookieMap[c.name] = c.value;
    }

    const sessionId = cookieMap["sessionid"];
    if (!sessionId) {
      // Check if still on login page — likely wrong credentials
      const stillOnLogin =
        page.url().includes("accounts/login") ||
        page.url().includes("challenge");
      await browser.close();
      return {
        success: false,
        error: stillOnLogin
          ? "Login failed — check your username and password"
          : "Login appeared to succeed but no session cookie was found",
      };
    }

    await browser.close();

    return {
      success: true,
      session: {
        cookies: cookieMap,
        userId: cookieMap["ds_user_id"] ?? "",
        username,
      },
    };
  } catch (err: unknown) {
    try { await browser?.close(); } catch { /* ignore */ }
    return {
      success: false,
      error: (err as Error).message ?? "Unknown error during login",
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers for authenticated API calls
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

    const profileUserId = await getInstagramUserId(username, sessionId, userId);
    if (!profileUserId) {
      return {
        success: false,
        error: "Could not find user — account may be private or not exist",
      };
    }

    const resp = await fetch(
      `${API_URL}/friendships/${profileUserId}/followers/?count=100`,
      { headers: { ...BASE_HEADERS, Cookie: cookie } },
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

async function getCsrfFromBrowser(sessionId: string, userId?: string): Promise<string> {
  const cookie = buildCookieHeader(sessionId, userId);
  try {
    const resp = await fetch(`${BASE_URL}/`, {
      headers: { ...BASE_HEADERS, Cookie: cookie },
      redirect: "manual",
    });
    const setCookies = resp.headers.getSetCookie?.() ?? [];
    const parsed = parseCookies(setCookies);
    return parsed["csrftoken"] ?? "";
  } catch {
    return "";
  }
}

export async function followUser(
  targetUserId: string,
  sessionId: string,
  myUserId?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const cookie = buildCookieHeader(sessionId, myUserId);
    const csrfToken = await getCsrfFromBrowser(sessionId, myUserId);

    const resp = await fetch(`${API_URL}/friendships/create/${targetUserId}/`, {
      method: "POST",
      headers: {
        ...BASE_HEADERS,
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
    const csrfToken = await getCsrfFromBrowser(sessionId, myUserId);

    const resp = await fetch(`${API_URL}/friendships/destroy/${targetUserId}/`, {
      method: "POST",
      headers: {
        ...BASE_HEADERS,
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

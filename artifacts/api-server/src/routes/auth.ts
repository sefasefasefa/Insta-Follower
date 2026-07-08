import { Router, type IRouter } from "express";
import { instagramLogin } from "../lib/instagram.js";
import { LoginBody } from "@workspace/api-zod";

const router: IRouter = Router();

// In-memory session store: token -> { sessionId, userId, username }
// In production, use Redis or express-session
const sessionStore = new Map<string, { sessionId: string; userId: string; username: string }>();

function generateToken(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * POST /api/auth/login
 * Body: { username, password, twoFactorCode? }
 */
router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.message });
    return;
  }

  const { username, password, twoFactorCode } = parsed.data;

  req.log.info({ username }, "Login attempt");

  const result = await instagramLogin(username, password, twoFactorCode ?? undefined);

  if (result.requiresTwoFactor) {
    res.json({
      success: false,
      requiresTwoFactor: true,
      twoFactorIdentifier: result.twoFactorIdentifier,
      error: result.error,
    });
    return;
  }

  if (!result.success || !result.session) {
    req.log.warn({ username, error: result.error }, "Login failed");
    res.status(200).json({ success: false, error: result.error });
    return;
  }

  // Create a server-side session token that maps to Instagram session
  const token = generateToken();
  sessionStore.set(token, {
    sessionId: result.session.cookies["sessionid"] ?? "",
    userId: result.session.userId,
    username: result.session.username,
  });

  req.log.info({ username }, "Login successful");

  res.json({
    success: true,
    sessionId: token,
    userId: result.session.userId,
    username: result.session.username,
  });
});

/**
 * POST /api/auth/logout
 */
router.post("/auth/logout", async (req, res): Promise<void> => {
  const token = (req.body as { sessionId?: string })?.sessionId;
  if (token) {
    sessionStore.delete(token);
  }
  res.json({ success: true, message: "Logged out" });
});

/**
 * GET /api/auth/session
 */
router.get("/auth/session", async (req, res): Promise<void> => {
  const token = req.query["sessionId"] as string | undefined;
  if (!token) {
    res.json({ loggedIn: false });
    return;
  }

  const session = sessionStore.get(token);
  if (!session) {
    res.json({ loggedIn: false });
    return;
  }

  res.json({
    loggedIn: true,
    sessionId: token,
    username: session.username,
  });
});

// Export session store for use in other routes
export { sessionStore };
export default router;

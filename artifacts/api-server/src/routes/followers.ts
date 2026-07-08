import { Router, type IRouter } from "express";
import { getFollowers, followUser, unfollowUser } from "../lib/instagram.js";
import {
  GetFollowersParams,
  GetFollowersQueryParams,
  FollowUserParams,
  FollowUserBody,
  UnfollowUserParams,
  UnfollowUserBody,
} from "@workspace/api-zod";
import { sessionStore } from "./auth.js";

const router: IRouter = Router();

/**
 * GET /api/followers/:username
 */
router.get("/followers/:username", async (req, res): Promise<void> => {
  const params = GetFollowersParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ success: false, error: params.error.message });
    return;
  }

  const query = GetFollowersQueryParams.safeParse(req.query);
  const token = query.success ? query.data.sessionId : undefined;

  if (!token) {
    res.status(401).json({ success: false, error: "Not authenticated" });
    return;
  }

  const session = sessionStore.get(token);
  if (!session) {
    res.status(401).json({ success: false, error: "Session expired — please log in again" });
    return;
  }

  req.log.info({ username: params.data.username }, "Fetching followers");

  const result = await getFollowers(params.data.username, session.sessionId, session.userId);

  if (!result.success || !result.followers) {
    req.log.warn({ username: params.data.username, error: result.error }, "Failed to fetch followers");
    res.status(500).json({ success: false, error: result.error });
    return;
  }

  const followers = result.followers;
  const male = followers.filter((f) => f.gender === "male" || f.gender === "mostly_male").length;
  const female = followers.filter((f) => f.gender === "female" || f.gender === "mostly_female").length;
  const unknown = followers.filter((f) => f.gender === "unknown" || f.gender === "andy").length;
  const following = followers.filter((f) => f.followedByViewer).length;

  res.json({
    success: true,
    followers,
    total: followers.length,
    stats: { total: followers.length, male, female, unknown, following },
  });
});

/**
 * POST /api/followers/follow/:userId
 */
router.post("/followers/follow/:userId", async (req, res): Promise<void> => {
  const params = FollowUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ success: false, error: params.error.message });
    return;
  }

  const body = FollowUserBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ success: false, error: body.error.message });
    return;
  }

  const session = sessionStore.get(body.data.sessionId);
  if (!session) {
    res.status(401).json({ success: false, error: "Session expired — please log in again" });
    return;
  }

  const result = await followUser(params.data.userId, session.sessionId, session.userId);

  if (!result.success) {
    res.status(500).json({ success: false, error: result.error });
    return;
  }

  res.json({ success: true, message: "Followed" });
});

/**
 * POST /api/followers/unfollow/:userId
 */
router.post("/followers/unfollow/:userId", async (req, res): Promise<void> => {
  const params = UnfollowUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ success: false, error: params.error.message });
    return;
  }

  const body = UnfollowUserBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ success: false, error: body.error.message });
    return;
  }

  const session = sessionStore.get(body.data.sessionId);
  if (!session) {
    res.status(401).json({ success: false, error: "Session expired — please log in again" });
    return;
  }

  const result = await unfollowUser(params.data.userId, session.sessionId, session.userId);

  if (!result.success) {
    res.status(500).json({ success: false, error: result.error });
    return;
  }

  res.json({ success: true, message: "Unfollowed" });
});

export default router;

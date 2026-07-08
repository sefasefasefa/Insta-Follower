import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import followersRouter from "./followers";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(followersRouter);

export default router;

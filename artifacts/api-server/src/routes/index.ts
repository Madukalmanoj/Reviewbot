import { Router, type IRouter } from "express";
import healthRouter from "./health";
import scansRouter from "./scans";
import statsRouter from "./stats";
import settingsRouter from "./settings";
import webhookRouter from "./webhook";
import eventsRouter from "./events";
import githubRouter from "./github";

const router: IRouter = Router();

router.use(healthRouter);
router.use(scansRouter);
router.use(statsRouter);
router.use(settingsRouter);
router.use(webhookRouter);
router.use(eventsRouter);
router.use(githubRouter);

export default router;

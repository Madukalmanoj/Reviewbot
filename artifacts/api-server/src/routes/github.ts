import { Router, type IRouter } from "express";
import { verifyGithubToken, getGithubToken } from "../lib/github";

const router: IRouter = Router();

router.get("/github/verify", async (_req, res): Promise<void> => {
  const token = await getGithubToken();
  if (!token) {
    res.json({ connected: false, identity: null, error: "No GitHub token configured" });
    return;
  }
  const result = await verifyGithubToken(token);
  res.json({
    connected: result.valid,
    identity: result.identity,
    error: result.error,
  });
});

export default router;

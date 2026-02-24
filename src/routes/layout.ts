import { Router } from "express";
import type { Request, Response } from "express";
import { buildUserContext, resolveLayout } from "../engine/layoutResolver";
import { getLayout, setLayout } from "../services/cacheService";

const router = Router();

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const { projectId } = req.query as { projectId?: string };
  const userId = req.user.id;

  if (!projectId) {
    res.status(400).json({ error: "projectId is required" });
    return;
  }

  try {
    // L1 + L2 cache check
    const cached = await getLayout(userId, projectId);
    if (cached) {
      res.json({ layout: cached, fromCache: true });
      return;
    }

    // Cache miss — build fresh layout
    const userContext = await buildUserContext(userId, projectId);
    const layout = await resolveLayout(userContext);

    // Store in cache
    await setLayout(userId, projectId, layout);

    res.json({ layout, fromCache: false });
  } catch (err) {
    console.error("[Layout] Error:", err);
    res.status(500).json({ error: "Failed to resolve layout" });
  }
});

export default router;

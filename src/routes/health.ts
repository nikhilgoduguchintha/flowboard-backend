import { Router } from "express";
import type { Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { redis } from "../lib/redis";
import { getConnectionCount } from "../services/sseManager";

const router = Router();

router.get("/", async (_req: Request, res: Response): Promise<void> => {
  const [dbCheck, redisCheck] = await Promise.allSettled([
    supabase.from("users").select("id").limit(1),
    redis.ping(),
  ]);

  res.json({
    status: "ok",
    db: dbCheck.status === "fulfilled" ? "ok" : "down",
    redis: redisCheck.status === "fulfilled" ? "ok" : "down",
    uptime: `${Math.floor(process.uptime())}s`,
    sseConnections: getConnectionCount(),
    timestamp: new Date().toISOString(),
  });
});

export default router;

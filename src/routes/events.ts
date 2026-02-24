import { Router } from "express";
import type { Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { registerClient, removeClient } from "../services/sseManager";

const router = Router();

const allowedOrigins = (process.env.FRONTEND_URL ?? "http://localhost:5173")
  .split(",")
  .map((url) => url.trim());

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const { token, projectId } = req.query as {
    token?: string;
    projectId?: string;
  };

  if (!token || !projectId) {
    res.status(400).json({ error: "token and projectId are required" });
    return;
  }

  // Verify JWT since EventSource cannot send Authorization header
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  // ── Dynamic CORS origin — only one value allowed by spec ────
  const requestOrigin = req.headers.origin ?? "";
  const allowedOrigin = allowedOrigins.includes(requestOrigin)
    ? requestOrigin
    : allowedOrigins[0];

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.flushHeaders();

  // Register SSE connection
  registerClient(user.id, projectId, res);

  // Send initial connected event
  res.write(
    `event: connected\ndata: ${JSON.stringify({ userId: user.id })}\n\n`
  );

  // Heartbeat every 30s — keeps Render free tier connection alive
  const heartbeat = setInterval(() => {
    res.write("event: ping\ndata: {}\n\n");
  }, 30_000);

  // Cleanup on client disconnect
  req.on("close", () => {
    clearInterval(heartbeat);
    removeClient(user.id);
  });
});

export default router;

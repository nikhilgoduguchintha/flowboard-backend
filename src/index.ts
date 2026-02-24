import "dotenv/config";
import express from "express";
import cors from "cors";

import { rateLimiter, authLimiter, sseLimiter } from "./middleware/rateLimiter";
import { authenticate } from "./middleware/authenticate";

import authRoutes from "./routes/auth";
import layoutRoutes from "./routes/layout";
import projectRoutes from "./routes/projects";
import memberRoutes from "./routes/members";
import sprintRoutes from "./routes/sprints";
import issueRoutes from "./routes/issues";
import commentRoutes from "./routes/comments";
import searchRoutes from "./routes/search";
import eventRoutes from "./routes/events";
import webhookRoutes from "./routes/webhooks";
import healthRoutes from "./routes/health";

const app = express();
const PORT = process.env.PORT ?? 3000;

// ─── Global Middleware ────────────────────────────────────────────────────────

app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:5173",
    credentials: true,
  })
);

app.use(express.json());

// ─── Public Routes ────────────────────────────────────────────────────────────

// Health check — no auth, no rate limit
// Render uses this to verify service is alive
app.use("/health", healthRoutes);

// Auth routes — stricter rate limiter, no JWT needed
app.use("/api/auth", authLimiter, authRoutes);

// Webhook — no JWT auth, verified by webhook secret instead
app.use("/webhooks", webhookRoutes);

// ─── Protected Routes — JWT Required ─────────────────────────────────────────

app.use("/api", rateLimiter, (req, res, next) => {
  // Skip authenticate for SSE — it has its own token verification
  if (req.path === "/events") return next();
  authenticate(req, res, next);
});

// Layout — SDUI engine endpoint
app.use("/api/layout", layoutRoutes);

// SSE — persistent connection, own rate limiter
app.use("/api/events", sseLimiter, eventRoutes);

// Projects
app.use("/api/projects", projectRoutes);

// Members — nested under projects
app.use("/api/projects", memberRoutes);

// Sprints — nested under projects
app.use("/api/projects", sprintRoutes);

// Issues — both /api/projects/:id/issues and /api/issues/:id
app.use("/api/projects", issueRoutes);
app.use("/api", issueRoutes);

// Comments — both /api/issues/:id/comments and /api/comments/:id
app.use("/api", commentRoutes);

// Search — nested under projects
app.use("/api/projects", searchRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("[Server] Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
);

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`
  ┌─────────────────────────────────────┐
  │     FlowBoard Backend               │
  │     Running on port ${PORT}            │
  │                                     │
  │     Health: /health                 │
  │     API:    /api                    │
  │     SSE:    /api/events             │
  └─────────────────────────────────────┘
  `);
});

export default app;

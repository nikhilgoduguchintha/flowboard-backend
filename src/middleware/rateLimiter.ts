import rateLimit from "express-rate-limit";

// ─── General API Limiter ──────────────────────────────────────────────────────
// Applied to all /api routes
// 100 requests per 15 minutes per IP

export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true, // sends RateLimit-* headers
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

// ─── Auth Limiter ─────────────────────────────────────────────────────────────
// Stricter limit specifically for login/signup
// Prevents brute force attacks
// 10 requests per 15 minutes per IP

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth attempts, please try again later" },
});

// ─── SSE Limiter ──────────────────────────────────────────────────────────────
// SSE connections are persistent — limit how many a single IP can open
// Prevents connection flooding
// 5 connections per 15 minutes per IP

export const sseLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many SSE connections" },
});

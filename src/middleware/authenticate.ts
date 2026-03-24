import type { Request, Response, NextFunction } from "express";
import { supabase } from "../lib/supabase";

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "No token provided" });
      return;
    }

    const token = authHeader.split("Bearer ")[1];

    // Verify token with Supabase Auth
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }

    // Fetch our users table profile
    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("*")
      .eq("id", user.id)
      .single();

    // Profile exists — attach and continue
    if (profile) {
      req.user = profile;
      next();
      return;
    }

    // No profile found — user needs to complete onboarding before accessing the app
    res.status(401).json({ error: "Profile not found. Please complete onboarding." });
  } catch {
    res.status(500).json({ error: "Authentication failed" });
  }
}

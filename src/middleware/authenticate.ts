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
    console.log(
      "[Auth] token sub:",
      JSON.parse(Buffer.from(token.split(".")[1], "base64").toString()).sub
    );

    // Verify token with Supabase Auth
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    console.log("Auth user:", user);
    console.log("Auth error:", error);

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
    console.log("[Auth] profile result:", { profile, profileError });

    if (profileError || !profile) {
      res.status(401).json({ error: "User profile not found" });
      return;
    }

    // Attach to request — available in all downstream handlers
    req.user = profile;
    next();
  } catch (err) {
    console.error("[Auth] Unexpected error:", err);
    res.status(500).json({ error: "Authentication failed" });
  }
}

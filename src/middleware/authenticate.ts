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

    console.log("Auth user:", user?.id);
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

    console.log("[Auth] profile result:", { profile: !!profile, profileError });

    // Profile exists — attach and continue
    if (profile) {
      req.user = profile;
      next();
      return;
    }

    // Profile not found — auto-create for OAuth users (e.g. Google)
    if (profileError) {
      const email = user.email ?? "";
      const name =
        user.user_metadata?.full_name ??
        user.user_metadata?.name ??
        email.split("@")[0];
      const user_handle = email
        .split("@")[0]
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "_");

      const { data: newProfile, error: createError } = await supabase
        .from("users")
        .insert({
          id: user.id,
          email,
          name,
          user_handle,
          avatar_seed: email,
        })
        .select()
        .single();

      console.log("[Auth] auto-created profile:", {
        newProfile: !!newProfile,
        createError,
      });

      if (createError || !newProfile) {
        res.status(401).json({ error: "Failed to create user profile" });
        return;
      }

      req.user = newProfile;
      next();
      return;
    }

    res.status(401).json({ error: "User profile not found" });
  } catch (err) {
    console.error("[Auth] Unexpected error:", err);
    res.status(500).json({ error: "Authentication failed" });
  }
}

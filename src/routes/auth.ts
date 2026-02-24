import { Router } from "express";
import type { Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { authLimiter } from "../middleware/rateLimiter";

const router = Router();

// ─── Sign Up ──────────────────────────────────────────────────────────────────

router.post(
  "/signup",
  authLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const { email, password, name, userHandle, isManager } = req.body as {
      email: string;
      password: string;
      name: string;
      userHandle: string;
      isManager?: boolean;
    };

    if (!email || !password || !name || !userHandle) {
      res.status(400).json({ error: "All fields are required" });
      return;
    }

    // Validate handle format
    const handleRegex = /^[a-z0-9_-]{3,20}$/;
    if (!handleRegex.test(userHandle)) {
      res.status(400).json({
        error:
          "Handle must be 3-20 characters — lowercase letters, numbers, hyphens, underscores only",
      });
      return;
    }

    // Check handle uniqueness
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("user_handle", userHandle)
      .maybeSingle();

    if (existing) {
      res.status(400).json({ error: "User handle already taken" });
      return;
    }

    // Create Supabase auth user
    const { data: auth, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (authError || !auth.user) {
      res
        .status(400)
        .json({ error: authError?.message ?? "Failed to create auth user" });
      return;
    }

    // Create profile in users table
    const { data: user, error: profileError } = await supabase
      .from("users")
      .insert({
        id: auth.user.id,
        email,
        name,
        user_handle: userHandle,
        avatar_seed: userHandle,
        is_manager: isManager ?? false,
      })
      .select()
      .single();

    if (profileError) {
      // Rollback auth user if profile creation fails
      await supabase.auth.admin.deleteUser(auth.user.id);
      res.status(400).json({ error: profileError.message });
      return;
    }

    res.status(201).json({ user });
  }
);

// ─── Login ────────────────────────────────────────────────────────────────────

router.post(
  "/login",
  authLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.body as { email: string; password: string };

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    res.json({
      session: data.session,
      user: data.user,
    });
  }
);

// ─── Logout ───────────────────────────────────────────────────────────────────

router.post("/logout", async (req: Request, res: Response): Promise<void> => {
  const token = req.headers.authorization?.split("Bearer ")[1];

  if (token) {
    await supabase.auth.admin.signOut(token);
  }

  res.json({ message: "Logged out successfully" });
});

export default router;

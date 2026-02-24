import type { Request, Response, NextFunction } from "express";
import { supabase } from "../lib/supabase";

type Role = "manager" | "developer";

// ─── Platform Level ───────────────────────────────────────────────────────────
// Checks is_manager flag on the user's global account
// Used for: create project

export function requireManager(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user?.is_manager) {
    res
      .status(403)
      .json({ error: "Only platform managers can perform this action" });
    return;
  }
  next();
}

// ─── Project Level ────────────────────────────────────────────────────────────
// Checks role within a specific project
// Used for: start sprint, close sprint, remove members etc.
// projectId resolved from: req.params.projectId → req.params.id → req.body.projectId

export function requireRole(...roles: Role[]) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const projectId =
        req.params.projectId ?? req.params.id ?? req.body.projectId ?? null;

      if (!projectId) {
        res
          .status(400)
          .json({ error: "projectId is required for authorization" });
        return;
      }

      const { data: member, error } = await supabase
        .from("project_members")
        .select("role")
        .eq("project_id", projectId)
        .eq("user_id", req.user.id)
        .single();

      if (error || !member) {
        res.status(403).json({ error: "You are not a member of this project" });
        return;
      }

      if (!roles.includes(member.role as Role)) {
        res.status(403).json({
          error: `This action requires one of these roles: ${roles.join(", ")}`,
        });
        return;
      }

      // Attach role so route handlers don't need to re-fetch it
      req.memberRole = member.role as Role;
      next();
    } catch (err) {
      console.error("[Authorize] Unexpected error:", err);
      res.status(500).json({ error: "Authorization failed" });
    }
  };
}

// ─── Project Membership Check ─────────────────────────────────────────────────
// Just checks the user is a member — no role restriction
// Used for: read-only routes where both roles have access

export function requireMembership(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  return requireRole("manager", "developer")(req, res, next);
}

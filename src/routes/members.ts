import { Router } from "express";
import type { Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { invalidateUserLayout } from "../services/cacheService";

const router = Router();

// ─── Get Project Members ──────────────────────────────────────────────────────

router.get(
  "/:projectId/members",
  async (req: Request, res: Response): Promise<void> => {
    const { data, error } = await supabase
      .from("project_members")
      .select(
        "id, role, joined_at, user_id, users ( id, name, user_handle, avatar_seed )"
      )
      .eq("project_id", req.params.projectId);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ members: data });
  }
);

// ─── Invite Member — Manager or Developer ────────────────────────────────────

router.post(
  "/:projectId/members",
  async (req: Request, res: Response): Promise<void> => {
    const { email, role } = req.body as {
      email: string;
      role: "manager" | "developer";
    };
    const { projectId, userId } = req.params as {
      projectId: string;
      userId: string;
    };

    if (!email || !role) {
      res.status(400).json({ error: "email and role are required" });
      return;
    }

    if (!["manager", "developer"].includes(role)) {
      res.status(400).json({ error: "role must be manager or developer" });
      return;
    }

    // Find user by email
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .single();

    if (userError || !user) {
      res.status(404).json({ error: "No user found with that email" });
      return;
    }

    // Check not already a member
    const { data: existing } = await supabase
      .from("project_members")
      .select("id")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      res
        .status(400)
        .json({ error: "User is already a member of this project" });
      return;
    }

    const { data, error } = await supabase
      .from("project_members")
      .insert({ project_id: projectId, user_id: user.id, role })
      .select()
      .single();

    if (error || !data) {
      res.status(400).json({ error: error?.message ?? "Failed to add member" });
      return;
    }

    // Invalidate layout cache for new member
    await invalidateUserLayout(user.id, projectId);

    res.status(201).json({ member: data });
  }
);

// ─── Remove Member — Manager Only ────────────────────────────────────────────

router.delete(
  "/:projectId/members/:userId",
  async (req: Request, res: Response): Promise<void> => {
    const { projectId, userId } = req.params as {
      projectId: string;
      userId: string;
    };

    // Verify requester is a manager
    const { data: requester } = await supabase
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", req.user.id)
      .single();

    if (requester?.role !== "manager") {
      res.status(403).json({ error: "Only managers can remove members" });
      return;
    }

    // Prevent removing the project owner
    const { data: project } = await supabase
      .from("projects")
      .select("owner_id")
      .eq("id", projectId)
      .single();

    if (project?.owner_id === userId) {
      res.status(400).json({ error: "Cannot remove the project owner" });
      return;
    }

    const { error } = await supabase
      .from("project_members")
      .delete()
      .eq("project_id", projectId)
      .eq("user_id", userId);

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    // Invalidate their layout cache
    await invalidateUserLayout(userId, projectId);

    res.json({ message: "Member removed successfully" });
  }
);

export default router;

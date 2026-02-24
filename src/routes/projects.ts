import { Router } from "express";
import type { Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { requireManager } from "../middleware/authorize";

const router = Router();

// ─── Get All Projects for Current User ───────────────────────────────────────

router.get("/", async (req: Request, res: Response): Promise<void> => {
  console.log("[projects] getAll for user:", req.user.id);

  const { data, error } = await supabase
    .from("project_members")
    .select(
      `
      role,
      joined_at,
      projects (
        id, name, key, type, is_archived, created_at,
        users!projects_owner_id_fkey ( name, user_handle )
      )
    `
    )
    .eq("user_id", req.user.id);
  console.log("[projects] raw data:", JSON.stringify(data, null, 2));
  console.log("[projects] error:", error);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const projects = data
    .filter((d) => d.projects && !(d.projects as any).is_archived)
    .map((d) => ({
      ...(d.projects as any),
      role: d.role,
      joined_at: d.joined_at,
    }));
  console.log("[projects] filtered projects:", projects.length);

  res.json({ projects });
});

// ─── Get Single Project ───────────────────────────────────────────────────────

router.get(
  "/:projectId",
  async (req: Request, res: Response): Promise<void> => {
    const { data, error } = await supabase
      .from("projects")
      .select(
        `
      *,
      users!projects_owner_id_fkey ( name, user_handle )
    `
      )
      .eq("id", req.params.projectId)
      .single();

    if (error || !data) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    res.json({ project: data });
  }
);

// ─── Create Project — Platform Manager Only ───────────────────────────────────

router.post(
  "/",
  requireManager,
  async (req: Request, res: Response): Promise<void> => {
    const { name, key, type } = req.body as {
      name: string;
      key: string;
      type: "scrum" | "kanban";
    };

    if (!name || !key || !type) {
      res.status(400).json({ error: "name, key and type are required" });
      return;
    }

    if (!["scrum", "kanban"].includes(type)) {
      res.status(400).json({ error: "type must be scrum or kanban" });
      return;
    }

    // Check key uniqueness
    const { data: existing } = await supabase
      .from("projects")
      .select("id")
      .eq("key", key.toUpperCase())
      .maybeSingle();

    if (existing) {
      res.status(400).json({ error: "Project key already taken" });
      return;
    }

    const { data: project, error } = await supabase
      .from("projects")
      .insert({
        name,
        key: key.toUpperCase(),
        type,
        owner_id: req.user.id,
      })
      .select()
      .single();

    if (error || !project) {
      res
        .status(400)
        .json({ error: error?.message ?? "Failed to create project" });
      return;
    }

    // Add creator as manager member automatically
    await supabase.from("project_members").insert({
      project_id: project.id,
      user_id: req.user.id,
      role: "manager",
    });

    res.status(201).json({ project });
  }
);

// ─── Update Project — Owner Only ──────────────────────────────────────────────

router.patch(
  "/:projectId",
  async (req: Request, res: Response): Promise<void> => {
    const { name } = req.body as { name: string };

    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const { data, error } = await supabase
      .from("projects")
      .update({ name })
      .eq("id", req.params.projectId)
      .eq("owner_id", req.user.id)
      .select()
      .single();

    if (error || !data) {
      res
        .status(400)
        .json({ error: "Failed to update project or not authorized" });
      return;
    }

    res.json({ project: data });
  }
);

// ─── Archive Project — Owner Only ─────────────────────────────────────────────

router.delete(
  "/:projectId",
  async (req: Request, res: Response): Promise<void> => {
    const { error } = await supabase
      .from("projects")
      .update({ is_archived: true })
      .eq("id", req.params.projectId)
      .eq("owner_id", req.user.id);

    if (error) {
      res
        .status(400)
        .json({ error: "Failed to archive project or not authorized" });
      return;
    }

    res.json({ message: "Project archived successfully" });
  }
);

export default router;

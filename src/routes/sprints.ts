import { Router } from "express";
import type { Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { invalidateProjectLayout } from "../services/cacheService";
import { pushToProject } from "../services/sseManager";

const router = Router();

// ─── Get Sprints ──────────────────────────────────────────────────────────────

router.get(
  "/:projectId/sprints",
  async (req: Request, res: Response): Promise<void> => {
    const { data, error } = await supabase
      .from("sprints")
      .select("*")
      .eq("project_id", req.params.projectId)
      .order("created_at", { ascending: false });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ sprints: data });
  }
);

// ─── Create Sprint — Manager Only ────────────────────────────────────────────

router.post(
  "/:projectId/sprints",
  async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params as { projectId: string };
    const { name, goal, startDate, endDate } = req.body as {
      name: string;
      goal?: string;
      startDate?: string;
      endDate?: string;
    };

    if (!name) {
      res.status(400).json({ error: "Sprint name is required" });
      return;
    }

    // Check manager role
    const { data: member } = await supabase
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", req.user.id)
      .single();

    if (member?.role !== "manager") {
      res.status(403).json({ error: "Only managers can create sprints" });
      return;
    }

    const { data, error } = await supabase
      .from("sprints")
      .insert({
        project_id: projectId,
        name,
        goal,
        start_date: startDate,
        end_date: endDate,
        status: "planning",
      })
      .select()
      .single();

    if (error || !data) {
      res
        .status(400)
        .json({ error: error?.message ?? "Failed to create sprint" });
      return;
    }

    // Sprint created — sprintStatus changes from 'none' to 'planning'
    // Invalidate layout so sprint_planning section appears for managers
    const { data: members } = await supabase
      .from("project_members")
      .select("user_id")
      .eq("project_id", projectId);

    if (members) {
      await invalidateProjectLayout(
        projectId,
        members.map((m) => m.user_id)
      );
    }

    res.status(201).json({ sprint: data });
  }
);

// ─── Start Sprint — Manager Only ──────────────────────────────────────────────

router.post(
  "/:projectId/sprints/:sprintId/start",
  async (req: Request, res: Response): Promise<void> => {
    const { projectId, sprintId } = req.params as {
      projectId: string;
      sprintId: string;
    };

    // Check manager
    const { data: member } = await supabase
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", req.user.id)
      .single();

    if (member?.role !== "manager") {
      res.status(403).json({ error: "Only managers can start sprints" });
      return;
    }

    // Ensure no other sprint is currently active
    const { data: activeSprint } = await supabase
      .from("sprints")
      .select("id, name")
      .eq("project_id", projectId)
      .eq("status", "active")
      .maybeSingle();

    if (activeSprint) {
      res
        .status(400)
        .json({ error: `Sprint "${activeSprint.name}" is already active` });
      return;
    }

    // Start the sprint
    const { data, error } = await supabase
      .from("sprints")
      .update({ status: "active" })
      .eq("id", sprintId)
      .eq("project_id", projectId)
      .select()
      .single();

    if (error || !data) {
      res
        .status(400)
        .json({ error: error?.message ?? "Failed to start sprint" });
      return;
    }

    // Invalidate layout cache for all project members
    const { data: members } = await supabase
      .from("project_members")
      .select("user_id")
      .eq("project_id", projectId);

    if (members) {
      await invalidateProjectLayout(
        projectId,
        members.map((m) => m.user_id)
      );
    }

    // Push SSE to all members
    pushToProject(projectId, "update", {
      actions: [
        { type: "invalidate_layout" },
        {
          type: "show_notification",
          message: `Sprint "${data.name}" has started!`,
          variant: "success",
        },
      ],
    });

    res.json({ sprint: data });
  }
);

// ─── Close Sprint — Manager Only ──────────────────────────────────────────────

router.post(
  "/:projectId/sprints/:sprintId/close",
  async (req: Request, res: Response): Promise<void> => {
    const { projectId, sprintId } = req.params as {
      projectId: string;
      sprintId: string;
    };

    // Check manager
    const { data: member } = await supabase
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", req.user.id)
      .single();

    if (member?.role !== "manager") {
      res.status(403).json({ error: "Only managers can close sprints" });
      return;
    }

    // Move incomplete issues back to backlog
    const { error: moveError } = await supabase
      .from("issues")
      .update({ sprint_id: null })
      .eq("sprint_id", sprintId)
      .neq("status", "done");

    if (moveError) {
      res
        .status(500)
        .json({ error: "Failed to move incomplete issues to backlog" });
      return;
    }

    // Close sprint
    const { data, error } = await supabase
      .from("sprints")
      .update({ status: "closed" })
      .eq("id", sprintId)
      .eq("project_id", projectId)
      .select()
      .single();

    if (error || !data) {
      res
        .status(400)
        .json({ error: error?.message ?? "Failed to close sprint" });
      return;
    }

    // Invalidate layout for all members
    const { data: members } = await supabase
      .from("project_members")
      .select("user_id")
      .eq("project_id", projectId);

    if (members) {
      await invalidateProjectLayout(
        projectId,
        members.map((m) => m.user_id)
      );
    }

    // Push SSE
    pushToProject(projectId, "update", {
      actions: [
        { type: "invalidate_layout" },
        {
          type: "show_notification",
          message: `Sprint "${data.name}" closed. Incomplete issues moved to backlog.`,
          variant: "info",
        },
      ],
    });

    res.json({ sprint: data });
  }
);

export default router;

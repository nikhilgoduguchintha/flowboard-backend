import { Router } from "express";
import type { Request, Response } from "express";
import { supabase } from "../lib/supabase";
import type { IssueType, IssuePriority } from "../types/index.js";

const router = Router();

// ─── Get Issues for Project ───────────────────────────────────────────────────

router.get(
  "/:projectId/issues",
  async (req: Request, res: Response): Promise<void> => {
    const { sprintId, type, status, assigneeId } = req.query as Record<
      string,
      string
    >;

    let query = supabase
      .from("issues")
      .select(
        `
      *,
      assignee:users!issues_assignee_id_fkey ( id, name, user_handle, avatar_seed ),
      reporter:users!issues_reporter_id_fkey ( id, name, user_handle, avatar_seed )
    `
      )
      .eq("project_id", req.params.projectId)
      .order("created_at", { ascending: false });

    if (sprintId) query = query.eq("sprint_id", sprintId);
    if (type) query = query.eq("type", type);
    if (status) query = query.eq("status", status);
    if (assigneeId) query = query.eq("assignee_id", assigneeId);

    const { data, error } = await query;

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ issues: data });
  }
);

// ─── Get Single Issue ─────────────────────────────────────────────────────────

router.get(
  "/issues/:issueId",
  async (req: Request, res: Response): Promise<void> => {
    console.log("[issues] getOne", req.params.issueId);
    const { data, error } = await supabase
      .from("issues")
      .select(
        `
      *,
      assignee:users!issues_assignee_id_fkey ( id, name, user_handle, avatar_seed ),
      reporter:users!issues_reporter_id_fkey ( id, name, user_handle, avatar_seed )
    `
      )
      .eq("id", req.params.issueId)
      .single();
    console.log("[issues] getOne result:", { data: !!data, error });

    if (error || !data) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }

    res.json({ issue: data });
  }
);

// ─── Create Issue ─────────────────────────────────────────────────────────────

router.post(
  "/:projectId/issues",
  async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;
    const {
      type,
      title,
      description,
      status,
      priority,
      assigneeId,
      sprintId,
      parentId,
      storyPoints,
      dueDate,
      typeFields,
    } = req.body as {
      type: IssueType;
      title: string;
      description?: string;
      status?: string;
      priority?: IssuePriority;
      assigneeId?: string;
      sprintId?: string;
      parentId?: string;
      storyPoints?: number;
      dueDate?: string;
      typeFields?: Record<string, unknown>;
    };

    if (!type || !title) {
      res.status(400).json({ error: "type and title are required" });
      return;
    }

    const validTypes: IssueType[] = ["epic", "story", "task", "bug", "subtask"];
    if (!validTypes.includes(type)) {
      res
        .status(400)
        .json({ error: `type must be one of: ${validTypes.join(", ")}` });
      return;
    }

    // ── Auto-promote: if sprint is assigned, start at todo not backlog ────────
    const requestedStatus = status ?? "backlog";
    const autoPromoted = !!sprintId && requestedStatus === "backlog";
    const resolvedStatus = autoPromoted ? "todo" : requestedStatus;

    // Get next issue number for this project
    const { data: issueNumber } = await supabase.rpc("next_issue_number", {
      p_project_id: projectId,
    });

    const { data, error } = await supabase
      .from("issues")
      .insert({
        project_id: projectId,
        issue_number: issueNumber,
        type,
        title,
        description,
        status: resolvedStatus,
        priority: priority ?? "medium",
        assignee_id: assigneeId ?? null,
        reporter_id: req.user.id,
        sprint_id: sprintId ?? null,
        parent_id: parentId ?? null,
        story_points: storyPoints ?? null,
        due_date: dueDate ?? null,
        type_fields: typeFields ?? {},
      })
      .select()
      .single();

    if (error || !data) {
      res
        .status(400)
        .json({ error: error?.message ?? "Failed to create issue" });
      return;
    }

    res.status(201).json({ issue: data, autoPromoted });
  }
);

// ─── Update Issue ─────────────────────────────────────────────────────────────

router.patch(
  "/issues/:issueId",
  async (req: Request, res: Response): Promise<void> => {
    const {
      title,
      description,
      status,
      priority,
      assigneeId,
      sprintId,
      storyPoints,
      dueDate,
      typeFields,
    } = req.body as {
      title?: string;
      description?: string;
      status?: string;
      priority?: IssuePriority;
      assigneeId?: string | null;
      sprintId?: string | null;
      storyPoints?: number;
      dueDate?: string;
      typeFields?: Record<string, unknown>;
    };

    // ── Auto-promote: if sprint is being assigned, check current status ───────
    let autoPromoted = false;
    let resolvedStatus = status;

    if (sprintId && status === undefined) {
      // Sprint is being set but status wasn't explicitly changed
      // Fetch current issue to check its status
      const { data: current } = await supabase
        .from("issues")
        .select("status")
        .eq("id", req.params.issueId)
        .single();

      if (current?.status === "backlog") {
        resolvedStatus = "todo";
        autoPromoted = true;
      }
    }

    const { data, error } = await supabase
      .from("issues")
      .update({
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(resolvedStatus !== undefined && { status: resolvedStatus }),
        ...(priority !== undefined && { priority }),
        ...(assigneeId !== undefined && { assignee_id: assigneeId }),
        ...(sprintId !== undefined && { sprint_id: sprintId }),
        ...(storyPoints !== undefined && { story_points: storyPoints }),
        ...(dueDate !== undefined && { due_date: dueDate }),
        ...(typeFields !== undefined && { type_fields: typeFields }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", req.params.issueId)
      .select()
      .single();

    if (error || !data) {
      res
        .status(400)
        .json({ error: error?.message ?? "Failed to update issue" });
      return;
    }

    res.json({ issue: data, autoPromoted });
  }
);

// ─── Update Status Only — Drag and Drop ──────────────────────────────────────

router.patch(
  "/issues/:issueId/status",
  async (req: Request, res: Response): Promise<void> => {
    const { status } = req.body as { status: string };

    if (!status) {
      res.status(400).json({ error: "status is required" });
      return;
    }

    const { data, error } = await supabase
      .from("issues")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", req.params.issueId)
      .select()
      .single();

    if (error || !data) {
      res
        .status(400)
        .json({ error: error?.message ?? "Failed to update status" });
      return;
    }

    res.json({ issue: data });
  }
);

// ─── Delete Issue ─────────────────────────────────────────────────────────────

router.delete(
  "/issues/:issueId",
  async (req: Request, res: Response): Promise<void> => {
    const { error } = await supabase
      .from("issues")
      .delete()
      .eq("id", req.params.issueId);

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.json({ message: "Issue deleted successfully" });
  }
);

export default router;

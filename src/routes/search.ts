import { Router } from "express";
import type { Request, Response } from "express";
import { supabase } from "../lib/supabase";

const router = Router();

router.get(
  "/:projectId/search",
  async (req: Request, res: Response): Promise<void> => {
    const { q, type, status, assigneeId } = req.query as Record<string, string>;

    if (!q || q.trim().length < 2) {
      res
        .status(400)
        .json({ error: "Search query must be at least 2 characters" });
      return;
    }

    const term = q.trim();

    // Step 1 — find users whose name matches the query
    const { data: matchingUsers } = await supabase
      .from("users")
      .select("id")
      .ilike("name", `%${term}%`);

    const matchingUserIds = matchingUsers?.map((u) => u.id) ?? [];

    // Step 2 — build OR filter: title match OR assignee name match
    const orFilter =
      matchingUserIds.length > 0
        ? `title.ilike.%${term}%,assignee_id.in.(${matchingUserIds.join(",")})`
        : `title.ilike.%${term}%`;

    let query = supabase
      .from("issues")
      .select(
        `
        id, issue_number, title, type, status, priority, project_id,
        assignee:users!issues_assignee_id_fkey ( id, name, user_handle, avatar_seed )
      `
      )
      .eq("project_id", req.params.projectId)
      .or(orFilter)
      .limit(20);

    if (type) query = query.eq("type", type);
    if (status) query = query.eq("status", status);
    if (assigneeId) query = query.eq("assignee_id", assigneeId);

    const { data, error } = await query;

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ results: data });
  }
);

export default router;

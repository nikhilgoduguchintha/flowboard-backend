import { Router } from "express";
import type { Request, Response } from "express";
import { supabase } from "../lib/supabase";

const router = Router();

// ─── Get Comments for Issue ───────────────────────────────────────────────────

router.get(
  "/issues/:issueId/comments",
  async (req: Request, res: Response): Promise<void> => {
    const { data, error } = await supabase
      .from("comments")
      .select(
        `
      *,
      users ( id, name, user_handle, avatar_seed )
    `
      )
      .eq("issue_id", req.params.issueId)
      .order("created_at", { ascending: true });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ comments: data });
  }
);

// ─── Add Comment ──────────────────────────────────────────────────────────────

router.post(
  "/issues/:issueId/comments",
  async (req: Request, res: Response): Promise<void> => {
    const { content } = req.body as { content: string };

    if (!content?.trim()) {
      res.status(400).json({ error: "Comment content is required" });
      return;
    }

    // Extract @mentions from content
    const mentions = [...content.matchAll(/@([a-z0-9_-]+)/g)].map((m) => m[1]);

    const { data, error } = await supabase
      .from("comments")
      .insert({
        issue_id: req.params.issueId,
        author_id: req.user.id,
        content: content.trim(),
        mentions,
      })
      .select(
        `
      *,
      users ( id, name, user_handle, avatar_seed )
    `
      )
      .single();

    if (error || !data) {
      res
        .status(400)
        .json({ error: error?.message ?? "Failed to add comment" });
      return;
    }

    res.status(201).json({ comment: data });
  }
);

// ─── Delete Comment — Author Only ─────────────────────────────────────────────

router.delete(
  "/comments/:commentId",
  async (req: Request, res: Response): Promise<void> => {
    const { error } = await supabase
      .from("comments")
      .delete()
      .eq("id", req.params.commentId)
      .eq("author_id", req.user.id); // ensures only author can delete

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.json({ message: "Comment deleted successfully" });
  }
);

export default router;

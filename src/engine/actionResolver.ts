import { supabase } from "../lib/supabase.js";
import type { ActionResult, Action } from "../types/index.js";

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: Record<string, unknown>;
  old_record: Record<string, unknown> | null;
}

export async function resolveActions(
  payload: WebhookPayload
): Promise<ActionResult | null> {
  const { type: event, table, record, old_record } = payload;

  switch (table) {
    case "issues":
      return resolveIssueActions(event, record, old_record);

    case "sprints":
      return resolveSprintActions(event, record, old_record);

    case "comments":
      return resolveCommentActions(event, record);

    case "project_members":
      return resolveMemberActions(event, record);

    default:
      console.warn(`[ActionResolver] Unhandled table: "${table}"`);
      return null;
  }
}

// ─── Issue Actions ────────────────────────────────────────────────────────────

function resolveIssueActions(
  event: string,
  record: Record<string, unknown>,
  old_record: Record<string, unknown> | null
): ActionResult {
  const actions: Action[] = [];

  if (event === "UPDATE" && old_record) {
    if (record.status !== old_record.status) {
      actions.push({
        type: "move_card",
        cardId: record.id as string,
        toColumn: record.status as string,
        fromColumn: old_record.status as string,
      });

      if (record.status === "done" && record.sprint_id) {
        actions.push({
          type: "update_progress",
          sprintId: record.sprint_id as string,
        });
      }

      actions.push({
        type: "show_notification",
        message: `Issue status updated to ${record.status}`,
        variant: "info",
      });
    }

    if (record.assignee_id !== old_record.assignee_id) {
      actions.push({
        type: "invalidate_issues",
        projectId: record.project_id as string,
      });
    }
  }

  if (event === "INSERT") {
    actions.push({
      type: "invalidate_issues",
      projectId: record.project_id as string,
    });
    actions.push({
      type: "show_notification",
      message: `New issue created`,
      variant: "info",
    });
  }

  if (event === "DELETE" && old_record) {
    actions.push({
      type: "remove_card",
      cardId: old_record.id as string,
      projectId: old_record.project_id as string,
    });
  }

  const projectId = (record?.project_id ?? old_record?.project_id) as
    | string
    | null;

  return { projectId, actions };
}

// ─── Sprint Actions ───────────────────────────────────────────────────────────

function resolveSprintActions(
  event: string,
  record: Record<string, unknown>,
  old_record: Record<string, unknown> | null
): ActionResult {
  const actions: Action[] = [];

  if (event === "UPDATE" && old_record) {
    const statusChanged = record.status !== old_record.status;

    if (statusChanged) {
      actions.push({ type: "invalidate_layout" });
      actions.push({
        type: "show_notification",
        message:
          record.status === "active"
            ? `Sprint "${record.name}" has started!`
            : `Sprint "${record.name}" has closed.`,
        variant: record.status === "active" ? "success" : "info",
      });
    }
  }

  return {
    projectId: record.project_id as string,
    actions,
  };
}

// ─── Comment Actions ──────────────────────────────────────────────────────────

async function resolveCommentActions(
  event: string,
  record: Record<string, unknown>
): Promise<ActionResult> {
  const actions: Action[] = [];

  // Look up project_id via the issue
  const issueId = record.issue_id as string;
  const { data: issue } = await supabase
    .from("issues")
    .select("project_id")
    .eq("id", issueId)
    .single();

  const projectId = issue?.project_id ?? null;

  if (event === "INSERT") {
    actions.push({
      type: "invalidate_comments",
      issueId,
    });

    const mentions = record.mentions as string[];
    if (mentions?.length > 0) {
      actions.push({
        type: "notify_mentions",
        mentions,
        issueId,
        message: "You were mentioned in a comment",
      });
    }
  }

  return {
    projectId,
    issueId,
    actions,
  };
}

// ─── Member Actions ───────────────────────────────────────────────────────────

function resolveMemberActions(
  event: string,
  record: Record<string, unknown>
): ActionResult {
  const actions: Action[] = [];

  if (["INSERT", "UPDATE", "DELETE"].includes(event)) {
    actions.push({
      type: "invalidate_layout",
      userId: record.user_id as string,
    });
  }

  return {
    projectId: record.project_id as string,
    actions,
  };
}

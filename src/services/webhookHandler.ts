import { supabase } from "../lib/supabase";
import { resolveActions } from "../engine/actionResolver";
import { pushToProject, pushToUser } from "./sseManager";
import { invalidateProjectLayout, invalidateUserLayout } from "./cacheService";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: Record<string, unknown>;
  old_record: Record<string, unknown> | null;
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

export async function handleWebhook(payload: WebhookPayload): Promise<void> {
  console.log(`[Webhook] Received ${payload.type} on ${payload.table}`);

  // Log webhook for reliability — store before processing
  const { data: event, error: logError } = await supabase
    .from("webhook_events")
    .insert({
      payload: {
        table_name: payload.table,
        event_type: payload.type,
        ...payload,
      },
    })
    .select("id")
    .single();

  if (logError || !event) {
    console.error("[Webhook] Failed to log webhook:", logError);
    return;
  }

  try {
    const result = await resolveActions(payload);

    if (!result || result.actions.length === 0) {
      await markProcessed(event.id);
      return;
    }

    const { projectId, actions } = result;

    // ── Handle layout invalidation ──────────────────────────────────────────
    const layoutAction = actions.find((a) => a.type === "invalidate_layout");

    if (layoutAction) {
      const targetUserId = layoutAction.userId as string | undefined;

      if (targetUserId && projectId) {
        await invalidateUserLayout(targetUserId, projectId);
      } else if (projectId) {
        const memberIds = await getProjectMemberIds(projectId);
        await invalidateProjectLayout(projectId, memberIds);
      }
    }

    // ── Push actions via SSE ────────────────────────────────────────────────
    if (projectId) {
      pushToProject(projectId, "update", {
        actions: [...actions, { type: "invalidate_activity", projectId }],
      });
    }

    // ── Handle @mention notifications ───────────────────────────────────────
    const mentionAction = actions.find((a) => a.type === "notify_mentions");
    if (mentionAction) {
      await handleMentionNotifications(
        mentionAction.mentions as string[],
        mentionAction.issueId as string,
        mentionAction.message as string
      );
    }

    // ── Handle user-specific layout invalidation via SSE ───────────────────
    if (layoutAction?.userId) {
      pushToUser(layoutAction.userId as string, "update", {
        actions: [{ type: "invalidate_layout" }],
      });
    }

    await markProcessed(event.id);
    console.log(`[Webhook] Processed ${payload.type} on ${payload.table}`);
  } catch (err) {
    console.error("[Webhook] Processing error:", err);
    await markFailed(
      event.id,
      err instanceof Error ? err.message : "Unknown error"
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getProjectMemberIds(projectId: string): Promise<string[]> {
  const { data } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId);

  return data?.map((m) => m.user_id) ?? [];
}

async function handleMentionNotifications(
  mentions: string[],
  issueId: string,
  message: string
): Promise<void> {
  if (mentions.length === 0) return;

  const { data: users } = await supabase
    .from("users")
    .select("id, user_handle")
    .in("user_handle", mentions);

  if (!users) return;

  users.forEach((user) => {
    pushToUser(user.id, "notification", {
      type: "mention",
      message,
      issueId,
    });
  });
}

async function markProcessed(eventId: string): Promise<void> {
  await supabase
    .from("webhook_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("id", eventId);
}

async function markFailed(eventId: string, error: string): Promise<void> {
  await supabase.from("webhook_events").update({ error }).eq("id", eventId);
}

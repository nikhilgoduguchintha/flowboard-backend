import { supabase } from "../lib/supabase";
import { evaluateRule } from "./ruleEvaluator";
import type {
  UserContext,
  ResolvedSection,
  SectionDefinition,
} from "../types/index.js";

// ─── Build User Context ───────────────────────────────────────────────────────

export async function buildUserContext(
  userId: string,
  projectId: string
): Promise<UserContext> {
  const [
    { data: user },
    { data: member },
    { data: project },
    { data: activeSprint },
    { count: issuesAssigned },
    { count: overdueCount },
    { count: openBugs },
  ] = await Promise.all([
    supabase.from("users").select("*").eq("id", userId).single(),

    supabase
      .from("project_members")
      .select("role, joined_at")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .single(),

    supabase.from("projects").select("type").eq("id", projectId).single(),

    supabase
      .from("sprints")
      .select("status, end_date")
      .eq("project_id", projectId)
      .eq("status", "active")
      .maybeSingle(),

    supabase
      .from("issues")
      .select("*", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("assignee_id", userId),

    supabase
      .from("issues")
      .select("*", { count: "exact", head: true })
      .eq("project_id", projectId)
      .lt("due_date", new Date().toISOString())
      .neq("status", "done"),

    supabase
      .from("issues")
      .select("*", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("type", "bug")
      .neq("status", "closed"),
  ]);

  if (!user || !member || !project) {
    throw new Error("Failed to build user context — missing required data");
  }

  const joinedAt = new Date(member.joined_at);
  const daysInProject = Math.floor(
    (Date.now() - joinedAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    userId,
    userHandle: user.user_handle,
    isManager: user.is_manager,
    projectId,
    projectType: project.type as "scrum" | "kanban",
    role: member.role as "manager" | "developer",
    sprintStatus: (activeSprint?.status ??
      "none") as UserContext["sprintStatus"],
    daysInProject,
    issuesAssigned: issuesAssigned ?? 0,
    hasOverdueIssues: (overdueCount ?? 0) > 0,
    openBugs: openBugs ?? 0,
    hour: new Date().getHours(),
  };
}

// ─── Resolve Layout ───────────────────────────────────────────────────────────

export async function resolveLayout(
  userContext: UserContext
): Promise<ResolvedSection[]> {
  const { data: sections, error } = await supabase
    .from("section_definitions")
    .select("*")
    .eq("is_active", true)
    .order("priority", { ascending: true });

  if (error || !sections) {
    throw new Error("Failed to fetch section definitions");
  }

  return (sections as SectionDefinition[])
    .filter((section) => evaluateRule(section.rules, userContext))
    .map((section) => ({
      id: section.id,
      sectionKey: section.section_key,
      type: section.type,
      props: resolveProps(section.section_key, userContext),
    }));
}

// ─── Resolve Props ────────────────────────────────────────────────────────────

type PropsResolver = (ctx: UserContext) => Record<string, unknown>;

const PROP_RESOLVERS: Record<string, PropsResolver> = {
  sprint_board: (ctx) => ({
    projectId: ctx.projectId,
    sprintStatus: ctx.sprintStatus,
  }),

  kanban_board: (ctx) => ({
    projectId: ctx.projectId,
  }),

  backlog_panel: (ctx) => ({
    projectId: ctx.projectId,
  }),

  analytics_panel: (ctx) => ({
    projectId: ctx.projectId,
    role: ctx.role,
  }),

  my_issues: (ctx) => ({
    projectId: ctx.projectId,
    userId: ctx.userId,
  }),

  sprint_timer: (ctx) => ({
    projectId: ctx.projectId,
    sprintStatus: ctx.sprintStatus,
  }),

  sprint_planning: (ctx) => ({
    projectId: ctx.projectId,
  }),

  overdue_alert: (ctx) => ({
    projectId: ctx.projectId,
  }),

  open_bugs_alert: (ctx) => ({
    projectId: ctx.projectId,
    openBugs: ctx.openBugs,
  }),

  sprint_completion: (ctx) => ({
    projectId: ctx.projectId,
  }),

  activity_feed: (ctx) => ({
    projectId: ctx.projectId,
  }),
};

function resolveProps(
  sectionKey: string,
  ctx: UserContext
): Record<string, unknown> {
  const resolver = PROP_RESOLVERS[sectionKey];
  if (!resolver) {
    console.warn(
      `[LayoutResolver] No prop resolver for section: "${sectionKey}"`
    );
    return {};
  }
  return resolver(ctx);
}

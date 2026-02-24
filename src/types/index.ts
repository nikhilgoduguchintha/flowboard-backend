export interface User {
  id: string;
  user_handle: string;
  email: string;
  name: string;
  avatar_seed: string;
  is_manager: boolean;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  key: string;
  type: "scrum" | "kanban";
  owner_id: string;
  is_archived: boolean;
  created_at: string;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: "manager" | "developer";
  joined_at: string;
}

export interface Sprint {
  id: string;
  project_id: string;
  name: string;
  goal: string | null;
  status: "planning" | "active" | "closed";
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

export type IssueType = "epic" | "story" | "task" | "bug" | "subtask";
export type IssuePriority = "critical" | "high" | "medium" | "low";

export interface Issue {
  id: string;
  issue_number: number;
  project_id: string;
  sprint_id: string | null;
  parent_id: string | null;
  type: IssueType;
  title: string;
  description: string | null;
  status: string;
  priority: IssuePriority;
  assignee_id: string | null;
  reporter_id: string | null;
  story_points: number | null;
  due_date: string | null;
  type_fields: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: string;
  issue_id: string;
  author_id: string;
  content: string;
  mentions: string[];
  created_at: string;
}

export interface SectionDefinition {
  id: string;
  section_key: string;
  type: string;
  rules: RuleNode;
  priority: number;
  is_active: boolean;
}

// Rule engine types
export type RuleOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "notIn"
  | "between";

export interface LeafNode {
  fact: string;
  operator: RuleOperator;
  value: unknown;
}

export interface CompositeNode {
  all?: RuleNode[];
  any?: RuleNode[];
  none?: RuleNode[];
}

export type RuleNode = LeafNode | CompositeNode;

export interface UserContext {
  userId: string;
  userHandle: string;
  isManager: boolean;
  projectId: string;
  projectType: "scrum" | "kanban";
  role: "manager" | "developer";
  sprintStatus: "planning" | "active" | "closed" | "none";
  daysInProject: number;
  issuesAssigned: number;
  hasOverdueIssues: boolean;
  openBugs: number;
  hour: number;
}

export interface ResolvedSection {
  id: string;
  sectionKey: string;
  type: string;
  props: Record<string, unknown>;
}

// SSE action types
export type ActionType =
  | "move_card"
  | "update_progress"
  | "show_notification"
  | "invalidate_layout"
  | "invalidate_issues"
  | "invalidate_comments"
  | "remove_card"
  | "notify_mentions"
  | "update_sprint_status";

export interface Action {
  type: ActionType;
  [key: string]: unknown;
}

export interface ActionResult {
  projectId: string | null;
  issueId?: string;
  actions: Action[];
}

// Express augmentation — adds user to req
declare global {
  namespace Express {
    interface Request {
      user: User;
      memberRole: "manager" | "developer";
    }
  }
}

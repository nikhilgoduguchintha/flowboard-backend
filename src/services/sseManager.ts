import type { Response } from "express";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SSEClient {
  res: Response;
  projectId: string;
  connectedAt: Date;
}

// ─── State ────────────────────────────────────────────────────────────────────

// userId → client
const clients = new Map<string, SSEClient>();

// projectId → Set of userIds
const projectIndex = new Map<string, Set<string>>();

// ─── Register ─────────────────────────────────────────────────────────────────

export function registerClient(
  userId: string,
  projectId: string,
  res: Response
): void {
  // Remove existing connection for this user if any
  // Prevents duplicate connections on reconnect
  if (clients.has(userId)) {
    removeClient(userId);
  }

  clients.set(userId, { res, projectId, connectedAt: new Date() });

  if (!projectIndex.has(projectId)) {
    projectIndex.set(projectId, new Set());
  }
  projectIndex.get(projectId)!.add(userId);

  console.log(
    `[SSE] Client connected — userId: ${userId} projectId: ${projectId} ` +
      `total: ${clients.size}`
  );
}

// ─── Remove ───────────────────────────────────────────────────────────────────

export function removeClient(userId: string): void {
  const client = clients.get(userId);
  if (!client) return;

  // Remove from project index
  projectIndex.get(client.projectId)?.delete(userId);

  // Clean up empty project sets
  if (projectIndex.get(client.projectId)?.size === 0) {
    projectIndex.delete(client.projectId);
  }

  clients.delete(userId);

  console.log(
    `[SSE] Client disconnected — userId: ${userId} total: ${clients.size}`
  );
}

// ─── Push to User ─────────────────────────────────────────────────────────────

export function pushToUser(userId: string, event: string, data: unknown): void {
  const client = clients.get(userId);
  if (!client) return;

  try {
    client.res.write(`event: ${event}\n`);
    client.res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch (err) {
    console.error(`[SSE] Failed to push to user ${userId}:`, err);
    removeClient(userId);
  }
}

// ─── Push to Project ──────────────────────────────────────────────────────────

export function pushToProject(
  projectId: string,
  event: string,
  data: unknown
): void {
  const userIds = projectIndex.get(projectId);
  if (!userIds || userIds.size === 0) return;

  console.log(
    `[SSE] Pushing "${event}" to ${userIds.size} clients in project ${projectId}`
  );

  userIds.forEach((userId) => pushToUser(userId, event, data));
}

// ─── Push to All ──────────────────────────────────────────────────────────────

export function pushToAll(event: string, data: unknown): void {
  console.log(`[SSE] Broadcasting "${event}" to all ${clients.size} clients`);
  clients.forEach((_, userId) => pushToUser(userId, event, data));
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export function getConnectionCount(): number {
  return clients.size;
}

export function getProjectConnectionCount(projectId: string): number {
  return projectIndex.get(projectId)?.size ?? 0;
}

export function getConnectionStats(): {
  total: number;
  projects: Record<string, number>;
} {
  const projects: Record<string, number> = {};
  projectIndex.forEach((userIds, projectId) => {
    projects[projectId] = userIds.size;
  });
  return { total: clients.size, projects };
}

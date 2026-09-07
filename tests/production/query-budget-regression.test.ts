import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Query-Budget & Architecture Regression Guard (Error 1102 Prevention)", () => {
  const rootDir = path.resolve(__dirname, "../../");

  // --- Requirement 1: Static Contract Protections ---
  it("protects Dashboard layout: must NEVER call getAuthoritativeWorkspaceStateAction", () => {
    const layoutPath = path.join(rootDir, "app/(dashboard)/layout.tsx");
    const layoutContent = fs.readFileSync(layoutPath, "utf-8");

    // Layout must strictly use lean layout context, never full workspace state
    expect(layoutContent).not.toContain("getAuthoritativeWorkspaceStateAction");
    expect(layoutContent).toContain("getAuthoritativeLayoutContextAction");
    expect(layoutContent).toContain("hydrateLayoutContext");
    expect(layoutContent).not.toContain("hydrateServerState");
  });

  it("protects Main Dashboard: must NOT use fetchAuthoritativeWorkspaceEntities or full table hydration", () => {
    const perfActionsPath = path.join(rootDir, "lib/actions/performance.ts");
    const perfContent = fs.readFileSync(perfActionsPath, "utf-8");

    const actionIndex = perfContent.indexOf("export async function getAuthoritativeMainDashboardAction");
    expect(actionIndex).toBeGreaterThan(-1);

    const actionSnippet = perfContent.slice(actionIndex, actionIndex + 6000);

    // Forbidden patterns: full state loaders and full table JavaScript scans
    expect(actionSnippet).not.toContain("fetchAuthoritativeWorkspaceEntities");
    expect(actionSnippet).not.toContain("calculateProjectPerformance");
    expect(actionSnippet).not.toContain("calculateEmployeeScorecard");

    // Must not query entire raw tables without boundaries
    expect(actionSnippet).not.toMatch(/db\s*\.\s*select\(\)\s*\.\s*from\(\s*workSessions\s*\)\s*\.\s*where/);
    expect(actionSnippet).not.toMatch(/db\s*\.\s*select\(\)\s*\.\s*from\(\s*contentItems\s*\)\s*\.\s*where\(\s*eq\(\s*contentItems\.orgId/);
    expect(actionSnippet).not.toMatch(/db\s*\.\s*select\(\)\s*\.\s*from\(\s*changeRequests\s*\)/);
  });

  it("protects Project Calendar: must use bounded Calendar action with both projectId and date boundaries", () => {
    const calendarPagePath = path.join(rootDir, "app/(dashboard)/projects/[projectId]/calendar/page.tsx");
    const calendarPageContent = fs.readFileSync(calendarPagePath, "utf-8");

    // Page must invoke bounded calendar action
    expect(calendarPageContent).toContain("getAuthoritativeCalendarDataAction");

    const calActionPath = path.join(rootDir, "lib/actions/calendar.ts");
    const calActionContent = fs.readFileSync(calActionPath, "utf-8");

    const calFnIndex = calActionContent.indexOf("export async function getAuthoritativeCalendarDataAction");
    expect(calFnIndex).toBeGreaterThan(-1);

    const calSnippet = calActionContent.slice(calFnIndex, calFnIndex + 4000);

    // Must assert both project_id AND date boundary predicates in the SQL query
    expect(calSnippet).toContain("contentItems.projectId");
    expect(calSnippet).toContain("startStr");
    expect(calSnippet).toContain("endStr");
    expect(calSnippet).toContain("scheduledPublicationDate");
    expect(calSnippet).toContain("submissionDeadline");
    expect(calSnippet).toContain("finalInternalDeadline");
  });

  it("protects Dashboard calculations: must use set-based SQL aggregations, not raw table fetches", () => {
    const perfActionsPath = path.join(rootDir, "lib/actions/performance.ts");
    const perfContent = fs.readFileSync(perfActionsPath, "utf-8");

    const actionIndex = perfContent.indexOf("export async function getAuthoritativeMainDashboardAction");
    const actionSnippet = perfContent.slice(actionIndex, actionIndex + 12000);

    // Verify set-based push-down into PostgreSQL
    expect(actionSnippet).toContain("COUNT(*) FILTER");
    expect(actionSnippet).toContain("COALESCE(SUM");
    expect(actionSnippet).toContain("GROUP BY");
    expect(actionSnippet).toContain("WITH user_planned AS");
    expect(actionSnippet).toContain("user_actuals AS");
  });

  it("protects operational engine: prevents repeated O(N*M) array scans for work sessions", () => {
    const enginePath = path.join(rootDir, "lib/calculations/operationalEngine.ts");
    const engineContent = fs.readFileSync(enginePath, "utf-8");

    // Operational engine must use indexed Map lookups, not repeated filter inside loops
    expect(engineContent).toContain("itemSessionSeconds");
    expect(engineContent).toContain("projItemSessionSeconds");
    expect(engineContent).not.toMatch(/workSessions\.filter\(\(s\)\s*=>\s*s\.contentItemId\s*===\s*item\.id\)/);
  });

  // --- Requirement 2: Production Code Guard Against Unbounded Operational Queries ---
  it("guards high-growth operational tables: enforces scope or bounds across operational actions", () => {
    const actionsDir = path.join(rootDir, "lib/actions");
    const actionFiles = [
      "calendar.ts",
      "capacity.ts",
      "changes.ts",
      "collaboration.ts",
      "content.ts",
      "performance.ts",
      "team.ts",
      "timers.ts",
      "workspace.ts",
    ];

    for (const file of actionFiles) {
      const filePath = path.join(actionsDir, file);
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, "utf-8");

      // Check comments: must always be scoped by contentItemId, submissionVersionId, authorUserId, or id
      const commentsQueries = content.match(/from\(\s*comments\s*\)[\s\S]{0,80}\.where\([\s\S]{0,180}/g) || [];
      for (const q of commentsQueries) {
        expect(q).toMatch(/contentItemId|submissionVersionId|authorUserId|id/);
      }

      // Check attendance: must be scoped by userId or attendanceDate
      const attQueries = content.match(/from\(\s*attendanceRecords\s*\)[\s\S]{0,80}\.where\([\s\S]{0,180}/g) || [];
      for (const q of attQueries) {
        expect(q).toMatch(/userId|attendanceDate/);
      }

      // Check workSessions in timers/team: must be scoped by userId, assignmentId, id, or active status
      if (file !== "workspace.ts") {
        const wsQueries = content.match(/from\(\s*workSessions\s*\)[\s\S]{0,80}\.where\([\s\S]{0,180}/g) || [];
        for (const q of wsQueries) {
          expect(q).toMatch(/userId|assignmentId|id|startedAt|sessionCondition/);
        }
      }
    }
  });

  // --- Requirement 3: Kanban Query-Budget & Architecture Protections ---
  it("protects Kanban: must NOT import or call getAuthoritativeWorkspaceStateAction or fetchAuthoritativeWorkspaceEntities", () => {
    const kanbanPagePath = path.join(rootDir, "app/(dashboard)/projects/[projectId]/kanban/page.tsx");
    const kanbanContent = fs.readFileSync(kanbanPagePath, "utf-8");

    // Kanban must strictly use dedicated bounded action
    expect(kanbanContent).not.toContain("getAuthoritativeWorkspaceStateAction");
    expect(kanbanContent).not.toContain("fetchAuthoritativeWorkspaceEntities");
    expect(kanbanContent).not.toContain("hydrateServerState");
    expect(kanbanContent).toContain("getAuthoritativeProjectKanbanAction");
  });

  it("protects Kanban action: must strictly enforce project scope and exclude deleted items", () => {
    const kanbanActionPath = path.join(rootDir, "lib/actions/kanban.ts");
    const actionContent = fs.readFileSync(kanbanActionPath, "utf-8");

    const actionIndex = actionContent.indexOf("export async function getAuthoritativeProjectKanbanAction");
    expect(actionIndex).toBeGreaterThan(-1);

    const actionSnippet = actionContent.slice(actionIndex, actionIndex + 12000);

    // Queries must be strictly project-scoped
    expect(actionSnippet).toContain("eq(contentItems.projectId, projectId)");
    expect(actionSnippet).toContain("isNull(contentItems.deletedAt)");
    expect(actionSnippet).toContain("eq(approvalDecisions.projectId, projectId)");
    expect(actionSnippet).toContain("eq(founderOverrides.projectId, projectId)");

    // Must not query unbounded tables
    expect(actionSnippet).not.toContain("workSessions");
    expect(actionSnippet).not.toContain("auditRecords");
    expect(actionSnippet).not.toContain("comments");
    expect(actionSnippet).not.toContain("changeRequests");

    // Pre-shaped card DTO assertions
    expect(actionSnippet).toContain("approvalSummary");
    expect(actionSnippet).toContain("productionOwner");
  });
});

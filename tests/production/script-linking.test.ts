import { describe, it, expect, beforeAll } from "vitest";
import { db } from "../../lib/db";
import { scripts, contentItems, projects, users } from "../../lib/db/schema";
import { createScriptAction, updateScriptAction, getScriptsAction } from "../../lib/actions/scripts";
import { getAuthoritativeWorkspaceStateAction } from "../../lib/actions/workspace";
import { eq } from "drizzle-orm";

import { enforceTestSafetyGuard } from "../helpers/safetyGuard";

describe("TEST A — Script-to-Deliverable Linking & Hydration Persistence", () => {
  let founderUser: any;
  let testProject: any;
  let testItem: any;

  beforeAll(async () => {
    enforceTestSafetyGuard();

    const activeUsers = await db.select().from(users).where(eq(users.status, "active"));
    founderUser = activeUsers.find((u) => u.organizationRole === "founder") || activeUsers[0];
    expect(founderUser).toBeDefined();

    const [proj] = await db.select().from(projects).where(eq(projects.orgId, founderUser.orgId)).limit(1);
    expect(proj).toBeDefined();
    testProject = proj;

    const [item] = await db.select().from(contentItems).where(eq(contentItems.projectId, testProject.id)).limit(1);
    expect(item).toBeDefined();
    testItem = item;
  });

  it("1. Create script linked to Deliverable -> DB row contains linked_content_item_id", async () => {
    const res = await createScriptAction({
      actorUserId: founderUser.id,
      projectId: testProject.id,
      title: "Automated Test Script",
      platform: "Instagram",
      linkedContentItemId: testItem.id,
      hook: "Did you know that script linking is now server-authoritative?",
      notes: "Test notes",
    });

    expect(res.success).toBe(true);
    expect(res.script).toBeDefined();
    expect(res.script?.linkedContentItemId).toBe(testItem.id);

    // Verify raw PostgreSQL DB row
    const [dbScript] = await db.select().from(scripts).where(eq(scripts.id, res.script!.id));
    expect(dbScript).toBeDefined();
    expect(dbScript.linkedContentItemId).toBe(testItem.id);
  });

  it("2. Workspace hydration returns the created script and linkedContentItemId", async () => {
    const ws = await getAuthoritativeWorkspaceStateAction(founderUser.id);
    expect(ws.success).toBe(true);

    const hydratedScript = ws.state.scripts.find((s) => s.linkedContentItemId === testItem.id);
    expect(hydratedScript).toBeDefined();
    expect(hydratedScript?.title).toBe("Automated Test Script");
  });

  it("3. Unlink script -> DB row updates linked_content_item_id to null", async () => {
    const { scripts: projScripts } = await getScriptsAction(testProject.id, founderUser.id);
    const linkedScript = projScripts.find((s) => s.linkedContentItemId === testItem.id);
    expect(linkedScript).toBeDefined();

    const res = await updateScriptAction({
      actorUserId: founderUser.id,
      scriptId: linkedScript!.id,
      linkedContentItemId: null,
    });

    expect(res.success).toBe(true);
    expect(res.script?.linkedContentItemId).toBeUndefined();

    // Verify raw DB row is null
    const [dbScript] = await db.select().from(scripts).where(eq(scripts.id, linkedScript!.id));
    expect(dbScript.linkedContentItemId).toBeNull();
  });
});

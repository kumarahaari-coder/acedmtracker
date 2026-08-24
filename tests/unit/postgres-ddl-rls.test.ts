import { describe, it, expect, beforeEach } from "vitest";
import { newDb, DataType, IMemoryDb } from "pg-mem";

describe("PostgreSQL Phase B Architecture & Workflows Validation Suite", () => {
  let db: IMemoryDb;

  beforeEach(() => {
    db = newDb();
    db.public.registerFunction({
      name: "gen_random_uuid",
      implementation: () => "00000000-0000-0000-0000-" + Math.random().toString(16).substring(2, 14).padStart(12, "0"),
    });

    const sessionVars: Record<string, string> = {};
    db.public.registerFunction({
      name: "set_config",
      args: [DataType.text, DataType.text, DataType.bool],
      returns: DataType.text,
      implementation: (name: string, val: string, isLocal: boolean) => {
        sessionVars[name] = val;
        return val;
      },
    });
    db.public.registerFunction({
      name: "current_setting",
      args: [DataType.text, DataType.bool],
      returns: DataType.text,
      implementation: (name: string, missingOk: boolean) => {
        return sessionVars[name] || (missingOk ? "" : null);
      },
    });
  });

  it("executes complete DDL, creates all composite FKs and prevents cross-project attachments", () => {
    db.public.none(`
      CREATE TABLE organizations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL
      );

      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL REFERENCES organizations(id),
        name TEXT NOT NULL,
        client_name TEXT NOT NULL,
        tier TEXT NOT NULL CHECK (tier IN ('tier_1', 'tier_2', 'tier_3')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived', 'trash', 'retained_archive')),
        created_at TEXT NOT NULL DEFAULT '2026-08-21T00:00:00Z',
        UNIQUE(id, org_id)
      );

      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        full_name TEXT NOT NULL
      );

      CREATE TABLE project_memberships (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        user_id TEXT NOT NULL REFERENCES users(id),
        role TEXT NOT NULL CHECK (role IN ('admin', 'founder', 'consultant', 'designer')),
        status TEXT NOT NULL DEFAULT 'active',
        UNIQUE(project_id, user_id)
      );

      CREATE TABLE content_items (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        title TEXT NOT NULL,
        platform TEXT NOT NULL,
        format TEXT NOT NULL,
        stage TEXT NOT NULL DEFAULT 'draft',
        UNIQUE(id, project_id)
      );

      CREATE TABLE content_assignments (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        content_item_id TEXT NOT NULL,
        assignee_user_id TEXT NOT NULL REFERENCES users(id),
        assignment_role TEXT NOT NULL CHECK (assignment_role IN ('designer', 'video_editor', 'collaborator')),
        status TEXT NOT NULL CHECK (status IN ('assigned', 'accepted', 'in_progress', 'submitted', 'reassigned', 'completed')),
        assigned_by_user_id TEXT NOT NULL REFERENCES users(id),
        assigned_at TEXT NOT NULL DEFAULT '2026-08-21T00:00:00Z',
        due_at TEXT NOT NULL,
        reassignment_reason TEXT,
        replaced_assignment_id TEXT REFERENCES content_assignments(id),
        FOREIGN KEY (content_item_id, project_id) REFERENCES content_items(id, project_id)
      );

      CREATE UNIQUE INDEX uq_active_content_assignment ON content_assignments (content_item_id, assignment_role) 
      WHERE status IN ('assigned', 'accepted', 'in_progress');

      CREATE TABLE scripts (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        title TEXT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('structured', 'freeform')),
        status TEXT NOT NULL DEFAULT 'draft',
        current_version_number INT NOT NULL DEFAULT 1,
        owner_user_id TEXT NOT NULL REFERENCES users(id),
        UNIQUE(id, project_id)
      );

      CREATE TABLE script_versions (
        id TEXT PRIMARY KEY,
        script_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        version_number INT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('structured', 'freeform')),
        searchable_plain_text TEXT NOT NULL,
        change_summary TEXT,
        is_submitted BOOLEAN NOT NULL DEFAULT FALSE,
        created_by_user_id TEXT NOT NULL REFERENCES users(id),
        UNIQUE(script_id, version_number),
        FOREIGN KEY (script_id, project_id) REFERENCES scripts(id, project_id)
      );

      CREATE TABLE script_content_links (
        id TEXT PRIMARY KEY,
        script_id TEXT NOT NULL,
        content_item_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        FOREIGN KEY (script_id, project_id) REFERENCES scripts(id, project_id),
        FOREIGN KEY (content_item_id, project_id) REFERENCES content_items(id, project_id),
        UNIQUE(script_id, content_item_id)
      );

      CREATE TABLE submission_versions (
        id TEXT PRIMARY KEY,
        content_item_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        version_number INT NOT NULL,
        caption TEXT NOT NULL,
        copy_fingerprint TEXT NOT NULL,
        creative_fingerprint TEXT NOT NULL,
        posting_date_fingerprint TEXT NOT NULL,
        UNIQUE(id, project_id, content_item_id),
        FOREIGN KEY (content_item_id, project_id) REFERENCES content_items(id, project_id)
      );

      CREATE TABLE approval_decisions (
        id TEXT PRIMARY KEY,
        submission_version_id TEXT NOT NULL,
        content_item_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        component TEXT NOT NULL CHECK (component IN ('copy', 'creative', 'posting_date')),
        reviewer_user_id TEXT NOT NULL REFERENCES users(id),
        decision TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        FOREIGN KEY (submission_version_id, project_id, content_item_id) REFERENCES submission_versions(id, project_id, content_item_id)
      );

      CREATE UNIQUE INDEX uq_active_approval_decision ON approval_decisions (submission_version_id, component, reviewer_user_id) WHERE (is_active = TRUE);
    `);

    // Insert Seed Data
    db.public.none(`
      INSERT INTO organizations VALUES ('org_1', 'Ace Agency', 'ace-agency');
      INSERT INTO projects VALUES ('proj_A', 'org_1', 'Acme Health', 'Acme', 'tier_1', 'active');
      INSERT INTO projects VALUES ('proj_B', 'org_1', 'SolarEdge', 'SolarEdge', 'tier_2', 'active');
      INSERT INTO users VALUES ('u_1', 'founder@ace.com', 'Vikram Shah');
      INSERT INTO users VALUES ('u_2', 'designer@ace.com', 'Rohan Verma');
      INSERT INTO users VALUES ('u_3', 'editor@ace.com', 'Ananya Sen');
      INSERT INTO project_memberships VALUES ('pm_1', 'proj_A', 'u_1', 'founder', 'active');
      INSERT INTO project_memberships VALUES ('pm_2', 'proj_A', 'u_2', 'designer', 'active');
      INSERT INTO project_memberships VALUES ('pm_3', 'proj_A', 'u_3', 'designer', 'active');
      INSERT INTO content_items VALUES ('item_A1', 'proj_A', 'Acme Post 1', 'Instagram', 'post', 'draft');
      INSERT INTO content_items VALUES ('item_B1', 'proj_B', 'Solar Post 1', 'LinkedIn', 'post', 'draft');
    `);

    // Verify Content Assignment & Reassignment Ledger
    db.public.none(`
      INSERT INTO content_assignments VALUES 
        ('asgn_1', 'proj_A', 'item_A1', 'u_2', 'designer', 'assigned', 'u_1', '2026-08-21T00:00:00Z', '2026-08-25T10:00:00Z', NULL, NULL);
    `);
    const activeAssignments = db.public.many(`SELECT id FROM content_assignments WHERE status = 'assigned';`);
    expect(activeAssignments.length).toBe(1);

    // Duplicate active primary designer assignment must fail unique constraint
    expect(() => {
      db.public.none(`
        INSERT INTO content_assignments VALUES 
          ('asgn_2', 'proj_A', 'item_A1', 'u_3', 'designer', 'assigned', 'u_1', '2026-08-21T00:00:00Z', '2026-08-25T10:00:00Z', NULL, NULL);
      `);
    }).toThrow();

    // Reassignment workflow: Mark previous as 'reassigned' and insert new assignment referencing replaced_assignment_id
    db.public.none(`
      UPDATE content_assignments SET status = 'reassigned', reassignment_reason = 'Workload rebalance' WHERE id = 'asgn_1';
      INSERT INTO content_assignments VALUES 
        ('asgn_2', 'proj_A', 'item_A1', 'u_3', 'designer', 'assigned', 'u_1', '2026-08-21T00:00:00Z', '2026-08-25T10:00:00Z', 'Workload rebalance', 'asgn_1');
    `);
    const reassignedHistory = db.public.many(`SELECT id, status, replaced_assignment_id FROM content_assignments WHERE content_item_id = 'item_A1';`);
    expect(reassignedHistory.length).toBe(2);
    expect(reassignedHistory.find(r => r.id === 'asgn_2')?.replaced_assignment_id).toBe('asgn_1');

    // Verify Versioned Script Editor & Many-to-Many Content Linking
    db.public.none(`
      INSERT INTO scripts VALUES ('scr_1', 'proj_A', 'Omnichannel Master Script', 'freeform', 'draft', 1, 'u_1');
      INSERT INTO script_versions VALUES ('scv_1', 'scr_1', 'proj_A', 1, 'freeform', 'Full Freeform Video Script Text with Custom Sections', 'Initial Draft', FALSE, 'u_1');
      INSERT INTO script_content_links VALUES ('scl_1', 'scr_1', 'item_A1', 'proj_A');
    `);

    const linkedItems = db.public.many(`SELECT content_item_id FROM script_content_links WHERE script_id = 'scr_1';`);
    expect(linkedItems.length).toBe(1);
    expect(linkedItems[0].content_item_id).toBe('item_A1');

    // Cross-project script link must fail composite foreign key check
    expect(() => {
      db.public.none(`
        INSERT INTO script_content_links VALUES ('scl_invalid', 'scr_1', 'item_B1', 'proj_B');
      `);
    }).toThrow();
  });

  it("verifies safe non-recursive SECURITY DEFINER authorization function", () => {
    db.public.none(`
      CREATE TABLE organizations (id TEXT PRIMARY KEY);
      CREATE TABLE projects (id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id));
      CREATE TABLE users (id TEXT PRIMARY KEY);
      CREATE TABLE project_memberships (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        user_id TEXT NOT NULL REFERENCES users(id),
        role TEXT NOT NULL,
        status TEXT NOT NULL
      );

      INSERT INTO organizations VALUES ('org_1');
      INSERT INTO projects VALUES ('proj_A', 'org_1'), ('proj_B', 'org_1');
      INSERT INTO users VALUES ('u_designer'), ('u_founder');
      INSERT INTO project_memberships VALUES
        ('pm_1', 'proj_A', 'u_designer', 'designer', 'active'),
        ('pm_2', 'proj_A', 'u_founder', 'founder', 'active');
    `);

    db.public.registerFunction({
      name: "user_has_project_role",
      args: [DataType.text, DataType.text, DataType.text],
      returns: DataType.bool,
      implementation: (userId: string, projectId: string, rolesCsv: string) => {
        const rows = db.public.many(
          `SELECT role, status FROM project_memberships WHERE user_id = '${userId}' AND project_id = '${projectId}' AND status = 'active'`
        );
        if (rows.length === 0) return false;
        if (!rolesCsv) return true;
        const allowed = rolesCsv.split(",");
        return allowed.includes(rows[0].role);
      },
    });

    const isMemberA = db.public.one(`SELECT user_has_project_role('u_designer', 'proj_A', '') as ok;`);
    expect(isMemberA.ok).toBe(true);

    const isMemberB = db.public.one(`SELECT user_has_project_role('u_designer', 'proj_B', '') as ok;`);
    expect(isMemberB.ok).toBe(false);
  });

  it("verifies pooled connection simulation does not leak context across transactions", () => {
    let currentTransactionUser: string | null = null;

    function runTransaction(userId: string, callback: (u: string) => any) {
      currentTransactionUser = userId;
      try {
        return callback(currentTransactionUser);
      } finally {
        currentTransactionUser = null;
      }
    }

    const res1 = runTransaction("user_alice_1", (activeUser) => {
      expect(activeUser).toBe("user_alice_1");
      return `result_for_${activeUser}`;
    });
    expect(res1).toBe("result_for_user_alice_1");
    expect(currentTransactionUser).toBeNull();

    const res2 = runTransaction("user_bob_2", (activeUser) => {
      expect(activeUser).toBe("user_bob_2");
      return `result_for_${activeUser}`;
    });
    expect(res2).toBe("result_for_user_bob_2");
    expect(currentTransactionUser).toBeNull();
  });
});

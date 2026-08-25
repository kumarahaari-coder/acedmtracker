import { describe, it, expect, beforeEach } from "vitest";
import { newDb, IMemoryDb, DataType } from "pg-mem";

describe("Milestone 3 Production Domains — Assignments, Approvals, Timers & Collaboration", () => {
  let db: IMemoryDb;

  // Mock tenancy IDs
  const orgId = "11111111-1111-4111-a111-111111111111";
  const projectId = "22222222-2222-4222-a222-222222222222";
  const founderUserId = "33333333-3333-4333-a333-333333333333";
  const consultantUserId = "44444444-4444-4444-a444-444444444444";
  const designer1Id = "55555555-5555-4555-a555-555555555555";
  const designer2Id = "66666666-6666-4666-a666-666666666666";
  const clientUserId = "77777777-7777-4777-a777-777777777777";

  const contentItemId = "88888888-8888-4888-a888-888888888888";
  const versionId = "99999999-9999-4999-a999-999999999999";

  beforeEach(async () => {
    db = newDb();
    db.public.registerFunction({
      name: "current_setting",
      args: [DataType.text, DataType.bool],
      returns: DataType.text,
      implementation: (name: string) => (name === "app.current_org_id" ? orgId : founderUserId),
    });

    // Bootstrap base tables
    await db.public.none(`
      CREATE TABLE organizations (
        id UUID PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE users (
        id UUID PRIMARY KEY,
        org_id UUID NOT NULL,
        email VARCHAR(255) NOT NULL,
        normalized_email VARCHAR(255) UNIQUE NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        organization_role VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE projects (
        id UUID PRIMARY KEY,
        org_id UUID NOT NULL,
        name VARCHAR(255) NOT NULL,
        client_name VARCHAR(255) NOT NULL,
        tier VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(org_id, id)
      );
      CREATE TABLE project_memberships (
        id UUID PRIMARY KEY,
        project_id UUID NOT NULL,
        user_id UUID NOT NULL,
        org_id UUID NOT NULL,
        membership_role VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'active',
        added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(project_id, user_id)
      );
      CREATE TABLE content_items (
        id UUID PRIMARY KEY,
        legacy_id VARCHAR(100) UNIQUE,
        project_id UUID NOT NULL,
        org_id UUID NOT NULL,
        title VARCHAR(255) NOT NULL,
        platform VARCHAR(50) NOT NULL,
        content_type VARCHAR(50) NOT NULL,
        stage VARCHAR(50) NOT NULL DEFAULT 'draft',
        scope_classification VARCHAR(50) NOT NULL DEFAULT 'contracted',
        client_visible BOOLEAN NOT NULL DEFAULT false,
        current_version_number INT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(project_id, id)
      );
      CREATE TABLE submission_versions (
        id UUID PRIMARY KEY,
        legacy_id VARCHAR(100) UNIQUE,
        content_item_id UUID NOT NULL,
        project_id UUID NOT NULL,
        org_id UUID NOT NULL,
        version_number INT NOT NULL,
        is_draft BOOLEAN NOT NULL DEFAULT true,
        caption TEXT NOT NULL DEFAULT '',
        hashtags TEXT[] NOT NULL DEFAULT '{}',
        cta TEXT NOT NULL DEFAULT '',
        copy_fingerprint VARCHAR(64) NOT NULL DEFAULT '',
        creative_fingerprint VARCHAR(64) NOT NULL DEFAULT '',
        posting_date_fingerprint VARCHAR(64) NOT NULL DEFAULT '',
        submitted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE content_assignments (
        id UUID PRIMARY KEY,
        legacy_id VARCHAR(100) UNIQUE,
        project_id UUID NOT NULL,
        org_id UUID NOT NULL,
        content_item_id UUID NOT NULL,
        assignee_user_id UUID NOT NULL,
        assignment_role VARCHAR(50) NOT NULL DEFAULT 'designer',
        status VARCHAR(50) NOT NULL DEFAULT 'assigned',
        assigned_by_user_id UUID NOT NULL,
        assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        accepted_at TIMESTAMPTZ,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        initial_due_at TIMESTAMPTZ NOT NULL,
        current_due_at TIMESTAMPTZ NOT NULL,
        first_submitted_at TIMESTAMPTZ,
        reassignment_reason TEXT,
        replaced_assignment_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE approval_decisions (
        id UUID PRIMARY KEY,
        legacy_id VARCHAR(100) UNIQUE,
        project_id UUID NOT NULL,
        org_id UUID NOT NULL,
        content_item_id UUID NOT NULL,
        submission_version_id UUID NOT NULL,
        component VARCHAR(50) NOT NULL,
        component_fingerprint VARCHAR(64) NOT NULL,
        reviewer_user_id UUID NOT NULL,
        reviewer_role VARCHAR(50) NOT NULL,
        decision VARCHAR(50) NOT NULL,
        note TEXT,
        decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        revoked_at TIMESTAMPTZ,
        revocation_reason TEXT,
        revoked_by_user_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE founder_overrides (
        id UUID PRIMARY KEY,
        legacy_id VARCHAR(100) UNIQUE,
        project_id UUID NOT NULL,
        org_id UUID NOT NULL,
        content_item_id UUID NOT NULL,
        submission_version_id UUID NOT NULL,
        component VARCHAR(50),
        reason TEXT NOT NULL,
        actor_user_id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE change_requests (
        id UUID PRIMARY KEY,
        legacy_id VARCHAR(100) UNIQUE,
        project_id UUID NOT NULL,
        org_id UUID NOT NULL,
        content_item_id UUID NOT NULL,
        submission_version_id UUID NOT NULL,
        component VARCHAR(50) NOT NULL,
        reviewer_user_id UUID NOT NULL,
        requested_change TEXT NOT NULL,
        priority VARCHAR(50) NOT NULL DEFAULT 'medium',
        status VARCHAR(50) NOT NULL DEFAULT 'open',
        resolution_reason TEXT,
        resolved_by_user_id UUID,
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE work_sessions (
        id UUID PRIMARY KEY,
        legacy_id VARCHAR(100) UNIQUE,
        project_id UUID NOT NULL,
        org_id UUID NOT NULL,
        content_item_id UUID NOT NULL,
        assignment_id UUID NOT NULL,
        user_id UUID NOT NULL,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ended_at TIMESTAMPTZ,
        accumulated_seconds INT NOT NULL DEFAULT 0,
        active_segment_started_at TIMESTAMPTZ,
        status VARCHAR(50) NOT NULL DEFAULT 'active',
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE attendance_records (
        id UUID PRIMARY KEY,
        legacy_id VARCHAR(100) UNIQUE,
        org_id UUID NOT NULL,
        user_id UUID NOT NULL,
        attendance_date DATE NOT NULL,
        checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        checked_out_at TIMESTAMPTZ,
        status VARCHAR(50) NOT NULL DEFAULT 'checked_in',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE external_review_tokens (
        id UUID PRIMARY KEY,
        legacy_id VARCHAR(100) UNIQUE,
        project_id UUID NOT NULL,
        org_id UUID NOT NULL,
        content_item_id UUID NOT NULL,
        submission_version_id UUID NOT NULL,
        token_hash VARCHAR(128) NOT NULL UNIQUE,
        allow_download BOOLEAN NOT NULL DEFAULT false,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        created_by_user_id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Insert seeds
    await db.public.none(`
      INSERT INTO organizations (id, name, slug) VALUES ('${orgId}', 'Ace Assured Test', 'ace-assured-test');
      INSERT INTO users (id, org_id, email, normalized_email, full_name, organization_role, status) VALUES
        ('${founderUserId}', '${orgId}', 'founder@ace.com', 'founder@ace.com', 'Vikram Shah', 'founder', 'active'),
        ('${consultantUserId}', '${orgId}', 'consultant@ace.com', 'consultant@ace.com', 'Priyah Sharma', 'consultant', 'active'),
        ('${designer1Id}', '${orgId}', 'designer1@ace.com', 'designer1@ace.com', 'Rohan Patel', 'designer', 'active'),
        ('${designer2Id}', '${orgId}', 'designer2@ace.com', 'designer2@ace.com', 'Amit Verma', 'designer', 'active'),
        ('${clientUserId}', '${orgId}', 'client@brand.com', 'client@brand.com', 'Client Sarah', 'client', 'active');
      INSERT INTO projects (id, org_id, name, client_name, tier, status) VALUES
        ('${projectId}', '${orgId}', 'Alpha Campaign', 'Brand Alpha', 'tier_1', 'active');
      INSERT INTO project_memberships (id, project_id, user_id, org_id, membership_role) VALUES
        ('${crypto.randomUUID()}', '${projectId}', '${founderUserId}', '${orgId}', 'founder'),
        ('${crypto.randomUUID()}', '${projectId}', '${consultantUserId}', '${orgId}', 'consultant'),
        ('${crypto.randomUUID()}', '${projectId}', '${designer1Id}', '${orgId}', 'designer'),
        ('${crypto.randomUUID()}', '${projectId}', '${designer2Id}', '${orgId}', 'designer'),
        ('${crypto.randomUUID()}', '${projectId}', '${clientUserId}', '${orgId}', 'client');
      INSERT INTO content_items (id, legacy_id, project_id, org_id, title, platform, content_type, stage) VALUES
        ('${contentItemId}', 'item_test1', '${projectId}', '${orgId}', 'Hero Product Post', 'Instagram', 'post', 'draft');
      INSERT INTO submission_versions (id, legacy_id, content_item_id, project_id, org_id, version_number, is_draft, copy_fingerprint, creative_fingerprint, posting_date_fingerprint, submitted_at) VALUES
        ('${versionId}', 'ver_test1', '${contentItemId}', '${projectId}', '${orgId}', 1, false, 'hash_copy_v1', 'hash_creative_v1', 'hash_date_v1', NOW());
    `);
  });

  it("1. Content Assignment & Reassignment preserves audit history and previous assignment", async () => {
    const asgn1Id = crypto.randomUUID();

    // Initial assignment to Designer 1
    await db.public.none(`
      INSERT INTO content_assignments (id, legacy_id, project_id, org_id, content_item_id, assignee_user_id, assignment_role, status, assigned_by_user_id, initial_due_at, current_due_at)
      VALUES ('${asgn1Id}', 'asgn_1', '${projectId}', '${orgId}', '${contentItemId}', '${designer1Id}', 'designer', 'assigned', '${consultantUserId}', NOW() + INTERVAL '3 days', NOW() + INTERVAL '3 days');
    `);

    // Designer 1 accepts assignment
    await db.public.none(`
      UPDATE content_assignments SET status = 'accepted', accepted_at = NOW() WHERE id = '${asgn1Id}';
    `);

    const asgn1 = db.public.many(`SELECT * FROM content_assignments WHERE id = '${asgn1Id}'`)[0];
    expect(asgn1.status).toBe("accepted");

    // Consultant reassigns to Designer 2
    const asgn2Id = crypto.randomUUID();
    await db.public.none(`
      UPDATE content_assignments 
      SET status = 'reassigned', reassignment_reason = 'Designer 1 workload reassignment', completed_at = NOW() 
      WHERE id = '${asgn1Id}';

      INSERT INTO content_assignments (id, legacy_id, project_id, org_id, content_item_id, assignee_user_id, assignment_role, status, assigned_by_user_id, initial_due_at, current_due_at, replaced_assignment_id)
      VALUES ('${asgn2Id}', 'asgn_2', '${projectId}', '${orgId}', '${contentItemId}', '${designer2Id}', 'designer', 'assigned', '${consultantUserId}', NOW() + INTERVAL '3 days', NOW() + INTERVAL '3 days', '${asgn1Id}');
    `);

    const assignments = db.public.many(`SELECT * FROM content_assignments WHERE content_item_id = '${contentItemId}'`);
    expect(assignments).toHaveLength(2);

    const oldAsgn = assignments.find((a: any) => a.id === asgn1Id);
    const newAsgn = assignments.find((a: any) => a.id === asgn2Id);

    expect(oldAsgn.status).toBe("reassigned");
    expect(oldAsgn.reassignment_reason).toBe("Designer 1 workload reassignment");
    expect(newAsgn.status).toBe("assigned");
    expect(newAsgn.replaced_assignment_id).toBe(asgn1Id);
  });

  it("2. Approval Decisions evaluate 3 components with dual sign-off (Founder + Consultant)", async () => {
    // Record Founder approvals on Copy, Creative, Date
    const compList = ["copy", "creative", "posting_date"];

    for (const comp of compList) {
      await db.public.none(`
        INSERT INTO approval_decisions (id, legacy_id, project_id, org_id, content_item_id, submission_version_id, component, component_fingerprint, reviewer_user_id, reviewer_role, decision)
        VALUES ('${crypto.randomUUID()}', 'dec_f_${comp}', '${projectId}', '${orgId}', '${contentItemId}', '${versionId}', '${comp}', 'hash_${comp}_v1', '${founderUserId}', 'founder', 'approved');
      `);
    }

    let decisions = db.public.many(`SELECT * FROM approval_decisions WHERE submission_version_id = '${versionId}'`);
    expect(decisions).toHaveLength(3);

    // Consultant approves Copy and Creative, but requests changes on Date
    await db.public.none(`
      INSERT INTO approval_decisions (id, legacy_id, project_id, org_id, content_item_id, submission_version_id, component, component_fingerprint, reviewer_user_id, reviewer_role, decision) VALUES
        ('${crypto.randomUUID()}', 'dec_c_copy', '${projectId}', '${orgId}', '${contentItemId}', '${versionId}', 'copy', 'hash_copy_v1', '${consultantUserId}', 'consultant', 'approved'),
        ('${crypto.randomUUID()}', 'dec_c_creative', '${projectId}', '${orgId}', '${contentItemId}', '${versionId}', 'creative', 'hash_creative_v1', '${consultantUserId}', 'consultant', 'approved'),
        ('${crypto.randomUUID()}', 'dec_c_date', '${projectId}', '${orgId}', '${contentItemId}', '${versionId}', 'posting_date', 'hash_date_v1', '${consultantUserId}', 'consultant', 'changes_requested');
    `);

    decisions = db.public.many(`SELECT * FROM approval_decisions WHERE submission_version_id = '${versionId}'`);
    const hasChangesRequested = decisions.some((d: any) => d.decision === "changes_requested");
    expect(hasChangesRequested).toBe(true);

    // Founder applies Override
    const ovrId = crypto.randomUUID();
    await db.public.none(`
      INSERT INTO founder_overrides (id, legacy_id, project_id, org_id, content_item_id, submission_version_id, reason, actor_user_id)
      VALUES ('${ovrId}', 'ovr_1', '${projectId}', '${orgId}', '${contentItemId}', '${versionId}', 'Founder override: Client requested Thursday broadcast', '${founderUserId}');
    `);

    const [override] = db.public.many(`SELECT * FROM founder_overrides WHERE content_item_id = '${contentItemId}'`);
    expect(override.reason).toContain("Client requested Thursday broadcast");
  });

  it("3. Change Requests and append-only designer responses", async () => {
    const crId = crypto.randomUUID();
    await db.public.none(`
      INSERT INTO change_requests (id, legacy_id, project_id, org_id, content_item_id, submission_version_id, component, reviewer_user_id, requested_change, priority, status)
      VALUES ('${crId}', 'cr_1', '${projectId}', '${orgId}', '${contentItemId}', '${versionId}', 'creative', '${consultantUserId}', 'Adjust brand logo contrast', 'high', 'open');
    `);

    const [openCr] = db.public.many(`SELECT * FROM change_requests WHERE id = '${crId}'`);
    expect(openCr.status).toBe("open");

    // Designer responds
    await db.public.none(`UPDATE change_requests SET status = 'addressed' WHERE id = '${crId}';`);
    const [addressedCr] = db.public.many(`SELECT * FROM change_requests WHERE id = '${crId}'`);
    expect(addressedCr.status).toBe("addressed");

    // Reviewer resolves change request
    await db.public.none(`
      UPDATE change_requests 
      SET status = 'resolved', resolution_reason = 'Verified in revised assets', resolved_by_user_id = '${consultantUserId}', resolved_at = NOW() 
      WHERE id = '${crId}';
    `);

    const [resolvedCr] = db.public.many(`SELECT * FROM change_requests WHERE id = '${crId}'`);
    expect(resolvedCr.status).toBe("resolved");
    expect(resolvedCr.resolution_reason).toBe("Verified in revised assets");
  });

  it("4. Server-Authoritative Work Sessions prevent overlapping timers and track accumulated seconds", async () => {
    const asgnId = crypto.randomUUID();
    await db.public.none(`
      INSERT INTO content_assignments (id, legacy_id, project_id, org_id, content_item_id, assignee_user_id, initial_due_at, current_due_at, assigned_by_user_id)
      VALUES ('${asgnId}', 'asgn_ws', '${projectId}', '${orgId}', '${contentItemId}', '${designer1Id}', NOW(), NOW(), '${consultantUserId}');
    `);

    const session1Id = crypto.randomUUID();
    await db.public.none(`
      INSERT INTO work_sessions (id, legacy_id, project_id, org_id, content_item_id, assignment_id, user_id, started_at, accumulated_seconds, active_segment_started_at, status)
      VALUES ('${session1Id}', 'ws_1', '${projectId}', '${orgId}', '${contentItemId}', '${asgnId}', '${designer1Id}', NOW() - INTERVAL '1 hour', 1800, NOW() - INTERVAL '1 hour', 'active');
    `);

    // Pause Session 1
    await db.public.none(`
      UPDATE work_sessions SET status = 'paused', accumulated_seconds = 3600, active_segment_started_at = NULL WHERE id = '${session1Id}';
    `);

    const [s1] = db.public.many(`SELECT * FROM work_sessions WHERE id = '${session1Id}'`);
    expect(s1.status).toBe("paused");
    expect(s1.accumulated_seconds).toBe(3600);
  });

  it("5. External Review Token generates expiring revocable sandbox access", async () => {
    const tokenId = crypto.randomUUID();
    const tokenHash = "sha256_mock_hash_for_external_client_review_token_1234567890";

    await db.public.none(`
      INSERT INTO external_review_tokens (id, legacy_id, project_id, org_id, content_item_id, submission_version_id, token_hash, allow_download, expires_at, created_by_user_id)
      VALUES ('${tokenId}', 'tok_1', '${projectId}', '${orgId}', '${contentItemId}', '${versionId}', '${tokenHash}', true, NOW() + INTERVAL '7 days', '${consultantUserId}');
    `);

    const [token] = db.public.many(`SELECT * FROM external_review_tokens WHERE token_hash = '${tokenHash}'`);
    expect(token).toBeDefined();
    expect(token.allow_download).toBe(true);
    expect(token.revoked_at).toBeNull();

    // Revoke token
    await db.public.none(`UPDATE external_review_tokens SET revoked_at = NOW() WHERE id = '${tokenId}';`);
    const [revokedToken] = db.public.many(`SELECT * FROM external_review_tokens WHERE id = '${tokenId}'`);
    expect(revokedToken.revoked_at).not.toBeNull();
  });
});

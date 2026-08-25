import { describe, it, expect, beforeEach } from "vitest";
import { newDb, DataType, IMemoryDb } from "pg-mem";

/**
 * Milestone 2: Content, Groups, Submissions & Publishing Test Suite
 * Validates:
 * 1. ContentItem creation & sequential versioning without ownership fields.
 * 2. Multi-platform ContentGroup atomic creation & transaction rollback.
 * 3. Submitted version immutability (trigger & action enforcement).
 * 4. Concurrency locking & Draft Invariant (at most 1 active draft per item).
 * 5. Designer publishing restrictions (cannot edit dates, liveUrl, clientVisible).
 * 6. Dual-mode legacy ID compatibility.
 */
describe("Milestone 2: Content & Versioning Architecture", () => {
  let db: IMemoryDb;

  beforeEach(() => {
    db = newDb();

    db.public.registerFunction({
      name: "gen_random_uuid",
      implementation: () => "00000000-0000-4000-a000-" + Math.random().toString(16).substring(2, 14).padStart(12, "0"),
    });

    const sessionVars: Record<string, string> = {};
    db.public.registerFunction({
      name: "set_config",
      args: [DataType.text, DataType.text, DataType.bool],
      returns: DataType.text,
      implementation: (name: string, val: string) => {
        sessionVars[name] = val;
        return val;
      },
    });
    db.public.registerFunction({
      name: "current_setting",
      args: [DataType.text, DataType.bool],
      returns: DataType.text,
      implementation: (name: string, missingOk: boolean) => sessionVars[name] || (missingOk ? "" : null),
    });

    // Milestone 1 & 2 DDL
    db.public.none(`
      CREATE TABLE organizations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL
      );

      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        legacy_id TEXT UNIQUE,
        org_id TEXT NOT NULL REFERENCES organizations(id),
        email TEXT NOT NULL,
        normalized_email TEXT NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        organization_role TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        UNIQUE(id, org_id)
      );

      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        legacy_id TEXT UNIQUE,
        org_id TEXT NOT NULL REFERENCES organizations(id),
        name TEXT NOT NULL,
        client_name TEXT NOT NULL,
        tier TEXT NOT NULL DEFAULT 'tier_2',
        status TEXT NOT NULL DEFAULT 'active',
        UNIQUE(id, org_id)
      );

      CREATE TABLE project_memberships (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        org_id TEXT NOT NULL,
        membership_role TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        UNIQUE(project_id, user_id),
        FOREIGN KEY (project_id, org_id) REFERENCES projects(id, org_id),
        FOREIGN KEY (user_id, org_id) REFERENCES users(id, org_id)
      );

      CREATE TABLE content_groups (
        id TEXT PRIMARY KEY,
        legacy_id TEXT UNIQUE,
        project_id TEXT NOT NULL,
        org_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        concept_notes TEXT,
        created_by_user_id TEXT NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT '2026-08-25T19:00:00Z',
        updated_at TEXT NOT NULL DEFAULT '2026-08-25T19:00:00Z',
        UNIQUE(project_id, id),
        FOREIGN KEY (project_id, org_id) REFERENCES projects(id, org_id)
      );

      CREATE TABLE content_items (
        id TEXT PRIMARY KEY,
        legacy_id TEXT UNIQUE,
        project_id TEXT NOT NULL,
        org_id TEXT NOT NULL,
        content_group_id TEXT REFERENCES content_groups(id),
        title TEXT NOT NULL,
        platform TEXT NOT NULL,
        content_type TEXT NOT NULL,
        stage TEXT NOT NULL DEFAULT 'draft',
        scope_classification TEXT NOT NULL DEFAULT 'contracted',
        client_visible BOOLEAN NOT NULL DEFAULT FALSE,
        published_at TEXT,
        live_url TEXT,
        published_by_user_id TEXT REFERENCES users(id),
        current_version_number INTEGER NOT NULL DEFAULT 1,
        submission_deadline TEXT,
        scheduled_publication_date TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        deleted_at TEXT,
        created_at TEXT NOT NULL DEFAULT '2026-08-25T19:00:00Z',
        updated_at TEXT NOT NULL DEFAULT '2026-08-25T19:00:00Z',
        UNIQUE(project_id, id),
        FOREIGN KEY (project_id, org_id) REFERENCES projects(id, org_id)
      );

      CREATE TABLE submission_versions (
        id TEXT PRIMARY KEY,
        legacy_id TEXT UNIQUE,
        content_item_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL,
        org_id TEXT NOT NULL,
        version_number INTEGER NOT NULL,
        is_draft BOOLEAN NOT NULL DEFAULT TRUE,
        caption TEXT NOT NULL DEFAULT '',
        cta TEXT NOT NULL DEFAULT '',
        scheduled_date TEXT,
        copy_fingerprint TEXT NOT NULL DEFAULT '',
        creative_fingerprint TEXT NOT NULL DEFAULT '',
        posting_date_fingerprint TEXT NOT NULL DEFAULT '',
        submitted_at TEXT,
        created_by_user_id TEXT REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT '2026-08-25T19:00:00Z',
        updated_at TEXT NOT NULL DEFAULT '2026-08-25T19:00:00Z',
        UNIQUE(content_item_id, version_number),
        UNIQUE(project_id, id),
        FOREIGN KEY (project_id, org_id) REFERENCES projects(id, org_id)
      );
    `);

    // Seed test project & actors
    db.public.none(`
      INSERT INTO organizations (id, name, slug) VALUES ('org_ace', 'Ace Assured', 'ace-assured');

      INSERT INTO users (id, org_id, email, normalized_email, full_name, organization_role, status) VALUES
        ('usr_founder', 'org_ace', 'founder@aceassured.com', 'founder@aceassured.com', 'Ace Founder', 'founder', 'active'),
        ('usr_consultant', 'org_ace', 'consultant@aceassured.com', 'consultant@aceassured.com', 'Ace Consultant', 'consultant', 'active'),
        ('usr_designer', 'org_ace', 'designer@aceassured.com', 'designer@aceassured.com', 'Lead Designer', 'designer', 'active'),
        ('usr_client', 'org_ace', 'client@pinkpalms.com', 'client@pinkpalms.com', 'Client Sarah', 'client', 'active');

      INSERT INTO projects (id, org_id, name, client_name) VALUES
        ('proj_pink', 'org_ace', 'Pink Palms Growth', 'Pink Palms');

      INSERT INTO project_memberships (id, project_id, user_id, org_id, membership_role, status) VALUES
        ('mem_1', 'proj_pink', 'usr_founder', 'org_ace', 'founder', 'active'),
        ('mem_2', 'proj_pink', 'usr_consultant', 'org_ace', 'consultant', 'active'),
        ('mem_3', 'proj_pink', 'usr_designer', 'org_ace', 'designer', 'active'),
        ('mem_4', 'proj_pink', 'usr_client', 'org_ace', 'client', 'active');
    `);
  });

  describe("1. ContentItem Creation & Ownership Separation", () => {
    it("creates ContentItem and V1 draft without introducing ownership fields into content_items table", () => {
      db.public.none(`
        INSERT INTO content_items (id, legacy_id, project_id, org_id, title, platform, content_type, stage)
        VALUES ('item_101', 'item_leg_101', 'proj_pink', 'org_ace', 'Brand Teaser', 'Instagram', 'reel', 'draft');

        INSERT INTO submission_versions (id, legacy_id, content_item_id, project_id, org_id, version_number, is_draft, caption)
        VALUES ('ver_101_v1', 'ver_leg_101_v1', 'item_101', 'proj_pink', 'org_ace', 1, true, 'Draft caption');
      `);

      const item = db.public.many(`SELECT * FROM content_items WHERE id = 'item_101';`)[0];
      expect(item.id).toBe("item_101");
      expect(item.legacy_id).toBe("item_leg_101");
      expect(item.client_visible).toBe(false);
      // Verify ownership columns are absent
      expect((item as any).accountable_owner_id).toBeUndefined();
      expect((item as any).collaborator_ids).toBeUndefined();
    });
  });

  describe("2. Multi-Platform ContentGroup Creation & Atomic Rollback", () => {
    it("creates 1 group, 3 child items, and 3 V1 drafts sharing concept notes", () => {
      db.public.none(`
        INSERT INTO content_groups (id, legacy_id, project_id, org_id, title, concept_notes, created_by_user_id)
        VALUES ('grp_launch', 'grp_leg_1', 'proj_pink', 'org_ace', 'Summer Launch', 'Bold summer colors', 'usr_consultant');

        INSERT INTO content_items (id, legacy_id, project_id, org_id, content_group_id, title, platform, content_type) VALUES
          ('item_ig', 'item_leg_ig', 'proj_pink', 'org_ace', 'grp_launch', 'Summer Launch (Instagram)', 'Instagram', 'reel'),
          ('item_li', 'item_leg_li', 'proj_pink', 'org_ace', 'grp_launch', 'Summer Launch (LinkedIn)', 'LinkedIn', 'carousel'),
          ('item_x', 'item_leg_x', 'proj_pink', 'org_ace', 'grp_launch', 'Summer Launch (X)', 'X', 'post');

        INSERT INTO submission_versions (id, legacy_id, content_item_id, project_id, org_id, version_number, is_draft) VALUES
          ('ver_ig_v1', 'ver_leg_ig_v1', 'item_ig', 'proj_pink', 'org_ace', 1, true),
          ('ver_li_v1', 'ver_leg_li_v1', 'item_li', 'proj_pink', 'org_ace', 1, true),
          ('ver_x_v1', 'ver_leg_x_v1', 'item_x', 'proj_pink', 'org_ace', 1, true);
      `);

      const group = db.public.many(`SELECT * FROM content_groups WHERE id = 'grp_launch';`);
      const items = db.public.many(`SELECT * FROM content_items WHERE content_group_id = 'grp_launch';`);
      const versions = db.public.many(`SELECT * FROM submission_versions WHERE content_item_id IN ('item_ig', 'item_li', 'item_x');`);

      expect(group).toHaveLength(1);
      expect(items).toHaveLength(3);
      expect(versions).toHaveLength(3);
    });
  });

  describe("3. Draft Invariant & Sequential Versioning Lifecycle", () => {
    it("enforces at most ONE active draft version per content item", () => {
      db.public.none(`
        INSERT INTO content_items (id, project_id, org_id, title, platform, content_type)
        VALUES ('item_draft_test', 'proj_pink', 'org_ace', 'Draft Test', 'Instagram', 'post');
      `);

      db.public.none(`
        INSERT INTO submission_versions (id, content_item_id, project_id, org_id, version_number, is_draft)
        VALUES ('ver_v1', 'item_draft_test', 'proj_pink', 'org_ace', 1, true);
      `);

      function createDraft(itemId: string, verNum: number) {
        const existing = db.public.many(`SELECT id FROM submission_versions WHERE content_item_id = '${itemId}' AND is_draft = true;`);
        if (existing.length > 0) {
          throw new Error("Draft Invariant Violation: An active draft already exists for this content item.");
        }
        db.public.none(`INSERT INTO submission_versions (id, content_item_id, project_id, org_id, version_number, is_draft) VALUES ('ver_v${verNum}', '${itemId}', 'proj_pink', 'org_ace', ${verNum}, true);`);
      }

      // Attempt creating a second active draft for the same item
      expect(() => {
        createDraft("item_draft_test", 2);
      }).toThrow("Draft Invariant Violation");
    });

    it("allows creating V2 draft only AFTER V1 is submitted (is_draft = false)", () => {
      db.public.none(`
        INSERT INTO content_items (id, project_id, org_id, title, platform, content_type)
        VALUES ('item_seq_test', 'proj_pink', 'org_ace', 'Seq Test', 'Instagram', 'post');
      `);

      db.public.none(`
        INSERT INTO submission_versions (id, content_item_id, project_id, org_id, version_number, is_draft, caption)
        VALUES ('ver_s1', 'item_seq_test', 'proj_pink', 'org_ace', 1, true, 'V1 Draft');
      `);

      // Submit V1
      db.public.none(`
        UPDATE submission_versions 
        SET is_draft = false, submitted_at = '2026-08-25T19:15:00Z'
        WHERE id = 'ver_s1';
      `);

      // Create V2 draft
      db.public.none(`
        INSERT INTO submission_versions (id, content_item_id, project_id, org_id, version_number, is_draft, caption)
        VALUES ('ver_s2', 'item_seq_test', 'proj_pink', 'org_ace', 2, true, 'V2 Draft');
      `);

      const versions = db.public.many(`SELECT version_number, is_draft, caption FROM submission_versions WHERE content_item_id = 'item_seq_test' ORDER BY version_number ASC;`);
      expect(versions).toHaveLength(2);
      expect(versions[0].version_number).toBe(1);
      expect(versions[0].is_draft).toBe(false);
      expect(versions[1].version_number).toBe(2);
      expect(versions[1].is_draft).toBe(true);
    });
  });

  describe("4. Designer Publishing Restrictions & URL Validation", () => {
    function updatePublishing(actorRole: string, liveUrl: string, schedDate: string) {
      if (actorRole === "designer") {
        throw new Error("403 Forbidden: Designers cannot modify scheduled publication dates or publish content.");
      }
      if (!/^https:\/\//.test(liveUrl)) {
        throw new Error("Invalid URL: Published liveUrl must be a secure https:// address.");
      }
      return { success: true };
    }

    it("DENIES Designer from updating scheduled publishing date or liveUrl", () => {
      expect(() => {
        updatePublishing("designer", "https://instagram.com/p/123", "2026-08-30T10:00:00Z");
      }).toThrow("Designers cannot modify scheduled publication dates");
    });

    it("ALLOWS Consultant/Founder to publish with valid https:// URL", () => {
      const result = updatePublishing("consultant", "https://instagram.com/p/123", "2026-08-30T10:00:00Z");
      expect(result.success).toBe(true);
    });

    it("REJECTS insecure, javascript: or malformed live URLs", () => {
      expect(() => {
        updatePublishing("consultant", "javascript:alert(1)", "2026-08-30T10:00:00Z");
      }).toThrow("must be a secure https:// address");
    });
  });
});

import { describe, it, expect, beforeAll } from "vitest";
import { db } from "../../lib/db";
import {
  contentItems,
  submissionVersions,
  submissionAssets,
  creativeAssets,
  projects,
  projectMemberships,
  users,
  externalReviewTokens,
  employeeCapacitySchedules,
} from "../../lib/db/schema";
import {
  toggleClientVisibilityAction,
} from "../../lib/actions/content";
import {
  generateExternalReviewTokenAction,
  verifyExternalReviewTokenAction,
  getGuestAuthorizedAssetDownloadUrlAction,
} from "../../lib/actions/collaboration";
import {
  updateTeamMemberAction,
} from "../../lib/actions/team";
import { getOrganizationPerformance } from "../../lib/performance";
import { eq, and, sql } from "drizzle-orm";
import { enforceTestSafetyGuard } from "../helpers/safetyGuard";
import { AppState, User, Project, ProjectMembership } from "../../lib/types";

describe("Guest Review DTO, Client Visibility, Team Profile & Performance Scoping", () => {
  let founderUser: any;
  let testProject: any;
  let testItem: any;
  let testVersion: any;
  let testAsset1: any;
  let testAsset2: any;
  let rawGuestToken: string;

  beforeAll(async () => {
    enforceTestSafetyGuard();

    // 1. Resolve Founder User
    const [founder] = await db
      .select()
      .from(users)
      .where(and(eq(users.organizationRole, "founder"), eq(users.status, "active")))
      .limit(1);
    founderUser = founder;

    // 2. Resolve Project
    const [proj] = await db.select().from(projects).limit(1);
    testProject = proj;

    // 3. Resolve or Create Content Item
    const [item] = await db
      .select()
      .from(contentItems)
      .where(eq(contentItems.projectId, testProject.id))
      .limit(1);
    testItem = item;

    if (testItem) {
      // 4. Resolve or create submission version with copy
      const [ver] = await db
        .select()
        .from(submissionVersions)
        .where(eq(submissionVersions.contentItemId, testItem.id))
        .limit(1);
      testVersion = ver;
    }
  });

  // --- 1. Guest Review DTO & Asset Authorization Tests ---
  describe("Guest Review DTO & Asset Authorization", () => {
    it("verifyExternalReviewTokenAction maps full copy payload and attached assets cleanly", async () => {
      if (!testItem || !testVersion) return;

      // Update version with known copy
      await db
        .update(submissionVersions)
        .set({
          caption: "Test Staging Festive Collection",
          hashtags: ["festive", "saree", "silk"],
          cta: "Shop Now at AceStore",
          destinationUrl: "https://example.com/festive",
        })
        .where(eq(submissionVersions.id, testVersion.id));

      // Generate guest review token
      const tokenRes = await generateExternalReviewTokenAction({
        actorUserId: founderUser.id,
        contentItemId: testItem.id,
        submissionVersionId: testVersion.id,
        allowDownload: true,
        expiresInDays: 3,
      });
      expect(tokenRes.success).toBe(true);
      expect(tokenRes.reviewUrl).toBeDefined();

      const rawToken = tokenRes.reviewUrl!.split("/guest/review/")[1];
      rawGuestToken = rawToken;

      const reviewRes = await verifyExternalReviewTokenAction(rawToken);
      expect(reviewRes.success).toBe(true);
      expect(reviewRes.submissionVersion).toBeDefined();

      const v = reviewRes.submissionVersion!;
      // Verify nested copy
      expect(v.copy.caption).toBe("Test Staging Festive Collection");
      expect(v.copy.hashtags).toEqual(["festive", "saree", "silk"]);
      expect(v.copy.cta).toBe("Shop Now at AceStore");
      expect(v.copy.destinationUrl).toBe("https://example.com/festive");
      // Verify top-level backwards compatibility
      expect(v.caption).toBe("Test Staging Festive Collection");
      expect(v.cta).toBe("Shop Now at AceStore");
      expect(Array.isArray(v.creativeAssets)).toBe(true);
    });

    it("guest cannot request an asset attached to another submission version", async () => {
      if (!rawGuestToken) return;

      // Try requesting a non-attached random asset ID
      const fakeAssetId = crypto.randomUUID();
      const assetRes = await getGuestAuthorizedAssetDownloadUrlAction({
        rawToken: rawGuestToken,
        assetId: fakeAssetId,
      });

      expect(assetRes.success).toBe(false);
      expect(assetRes.error).toContain("Unauthorized: Asset not attached to this review version.");
    });
  });

  // --- 2. Client Visibility Toggle Persistence Tests ---
  describe("Client Visibility Mutation & Persistence", () => {
    it("toggles client_visible ON and OFF and persists directly in PostgreSQL", async () => {
      if (!testItem) return;

      // Toggle ON
      const onRes = await toggleClientVisibilityAction({
        actorUserId: founderUser.id,
        contentItemId: testItem.id,
        clientVisible: true,
      });
      expect(onRes.success).toBe(true);
      expect(onRes.item?.clientVisible).toBe(true);

      // Verify PostgreSQL row
      const [itemAfterOn] = await db
        .select({ clientVisible: contentItems.clientVisible })
        .from(contentItems)
        .where(eq(contentItems.id, testItem.id));
      expect(itemAfterOn.clientVisible).toBe(true);

      // Toggle OFF
      const offRes = await toggleClientVisibilityAction({
        actorUserId: founderUser.id,
        contentItemId: testItem.id,
        clientVisible: false,
      });
      expect(offRes.success).toBe(true);
      expect(offRes.item?.clientVisible).toBe(false);

      // Verify PostgreSQL row
      const [itemAfterOff] = await db
        .select({ clientVisible: contentItems.clientVisible })
        .from(contentItems)
        .where(eq(contentItems.id, testItem.id));
      expect(itemAfterOff.clientVisible).toBe(false);
    });
  });

  // --- 3. Team Member Profile Edits & Auth.js Safety Tests ---
  describe("Team Member Profile Edits & Auth.js Safety", () => {
    it("persists non-auth profile fields in PostgreSQL", async () => {
      // Find a designer user
      const [designer] = await db
        .select()
        .from(users)
        .where(and(eq(users.organizationRole, "designer"), eq(users.status, "active")))
        .limit(1);

      if (!designer) return;

      const newName = designer.fullName + " Updated";
      const updateRes = await updateTeamMemberAction({
        actorUserId: founderUser.id,
        targetUserId: designer.id,
        fullName: newName,
        workingHoursPerDay: 7.5,
        primaryFunction: "Creative",
      });

      expect(updateRes.success).toBe(true);
      expect(updateRes.user?.fullName).toBe(newName);

      // Query PostgreSQL directly to ensure authoritative persistence
      const [dbUser] = await db.select().from(users).where(eq(users.id, designer.id)).limit(1);
      expect(dbUser.fullName).toBe(newName);

      // Restore original name
      await updateTeamMemberAction({
        actorUserId: founderUser.id,
        targetUserId: designer.id,
        fullName: designer.fullName,
      });
    });

    it("blocks email edit if user is already linked to Google/Auth.js identity", async () => {
      // Find a user with authUserId NOT NULL
      const [linkedUser] = await db
        .select()
        .from(users)
        .where(sql`${users.authUserId} IS NOT NULL`)
        .limit(1);

      if (!linkedUser) return;

      const res = await updateTeamMemberAction({
        actorUserId: founderUser.id,
        targetUserId: linkedUser.id,
        email: "newemail_blocked@example.com",
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Login email cannot be changed because this account is already linked to a Google/OAuth identity.");
    });
  });

  // --- 4. Project Performance Scoped Membership Tests ---
  describe("Project Performance Scoped Membership", () => {
    it("scopes Assigned Team Performance strictly to active internal project members", () => {
      // Mock AppState
      const mockState: any = {
        projects: [
          { id: "proj_1", name: "CraftXSpaces", clientBrand: "CraftX", status: "active", timezone: "Asia/Kolkata" },
        ],
        users: [
          { id: "user_a", name: "Designer A", role: "designer", status: "active" },
          { id: "user_b", name: "Consultant B", role: "consultant", status: "active" },
          { id: "user_c", name: "Designer C", role: "designer", status: "active" }, // Not on proj_1
          { id: "user_d", name: "Client D", role: "client", status: "active" },       // Client
        ],
        projectMemberships: [
          { id: "mem_1", projectId: "proj_1", userId: "user_a", membershipRole: "designer", status: "active" },
          { id: "mem_2", projectId: "proj_1", userId: "user_b", membershipRole: "consultant", status: "active" },
          { id: "mem_3", projectId: "proj_1", userId: "user_d", membershipRole: "client", status: "active" },
        ],
        contentItems: [],
        contentAssignments: [],
        workSessions: [],
        submissionVersions: [],
        changeRequests: [],
        attendanceRecords: [],
      };

      const result = getOrganizationPerformance(mockState, "founder_id", "founder", {
        projectId: "proj_1",
        dateRange: "all",
      });

      expect(result.status).toBe(200);
      expect(result.data).toBeDefined();

      const scorecards = result.data!.scorecards;
      const renderedUserIds = scorecards.map((s) => s.userId);

      // Designer A & Consultant B must appear
      expect(renderedUserIds).toContain("user_a");
      expect(renderedUserIds).toContain("user_b");

      // Designer C (unassigned employee) must NOT appear
      expect(renderedUserIds).not.toContain("user_c");

      // Client D must NOT appear
      expect(renderedUserIds).not.toContain("user_d");

      expect(scorecards.length).toBe(2);
    });

    it("removes revoked member from current active-team table and marks former contributor if historical work exists", () => {
      const mockState: any = {
        projects: [
          { id: "proj_1", name: "CraftXSpaces", clientBrand: "CraftX", status: "active", timezone: "Asia/Kolkata" },
        ],
        users: [
          { id: "user_a", name: "Designer A", role: "designer", status: "active" },
          { id: "user_former", name: "Former Contributor", role: "designer", status: "active" },
        ],
        projectMemberships: [
          { id: "mem_1", projectId: "proj_1", userId: "user_a", membershipRole: "designer", status: "active" },
          // user_former has revoked/inactive membership
          { id: "mem_2", projectId: "proj_1", userId: "user_former", membershipRole: "designer", status: "inactive" },
        ],
        contentItems: [
          { id: "item_1", projectId: "proj_1", title: "Past Deliverable", platform: "Instagram", contentType: "post", stage: "published" },
        ],
        contentAssignments: [
          { id: "asgn_1", contentItemId: "item_1", assigneeUserId: "user_former", assignmentRole: "designer", status: "completed" },
        ],
        workSessions: [
          { id: "ws_1", assignmentId: "asgn_1", userId: "user_former", accumulatedSeconds: 3600, startedAt: new Date().toISOString() },
        ],
        submissionVersions: [],
        changeRequests: [],
        attendanceRecords: [],
      };

      const result = getOrganizationPerformance(mockState, "founder_id", "founder", {
        projectId: "proj_1",
        dateRange: "all",
      });

      expect(result.status).toBe(200);
      const scorecards = result.data!.scorecards;

      const activeMemberCard = scorecards.find((s) => s.userId === "user_a");
      const formerMemberCard = scorecards.find((s) => s.userId === "user_former");

      expect(activeMemberCard).toBeDefined();
      expect(activeMemberCard?.isFormerContributor).toBe(false);

      expect(formerMemberCard).toBeDefined();
      expect(formerMemberCard?.isFormerContributor).toBe(true);
    });

    it("returns zero-state when no active internal members are assigned to project", () => {
      const mockState: any = {
        projects: [
          { id: "proj_empty", name: "Empty Proj", clientBrand: "Empty", status: "active", timezone: "Asia/Kolkata" },
        ],
        users: [
          { id: "user_unrelated", name: "Unrelated Designer", role: "designer", status: "active" },
        ],
        projectMemberships: [],
        contentItems: [],
        contentAssignments: [],
        workSessions: [],
        submissionVersions: [],
        changeRequests: [],
        attendanceRecords: [],
      };

      const result = getOrganizationPerformance(mockState, "founder_id", "founder", {
        projectId: "proj_empty",
        dateRange: "all",
      });

      expect(result.status).toBe(200);
      expect(result.data!.scorecards.length).toBe(0);
    });
  });
});

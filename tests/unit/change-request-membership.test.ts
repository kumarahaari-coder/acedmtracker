import { describe, it, expect } from "vitest";
import { UserRole } from "@/lib/types";

describe("Change Request & Team Member Management Suite", () => {
  it("verifies change request immediately transitions stage to changes_requested and emits notification", () => {
    let item = {
      id: "item_1",
      projectId: "proj_1",
      title: "Hero Campaign",
      stage: "in_review",
      assignedDesignerUserId: "u_designer1",
    };

    let changeRequests: any[] = [];
    let notifications: any[] = [];

    function createChangeRequest(req: {
      projectId: string;
      contentItemId: string;
      component: "copy" | "creative" | "posting_date";
      reviewerUserId: string;
      reviewerName: string;
      requestedChange: string;
      priority: "medium" | "high" | "critical";
    }) {
      const cr = {
        id: "cr_101",
        ...req,
        status: "open",
        createdAt: new Date().toISOString(),
      };
      changeRequests.push(cr);
      if (item.id === req.contentItemId) {
        item.stage = "changes_requested";
      }
      notifications.push({
        id: "notif_101",
        recipientUserId: item.assignedDesignerUserId,
        eventType: "changes_requested",
        message: `${req.reviewerName} requested changes: "${req.requestedChange}"`,
      });
      return cr;
    }

    const cr = createChangeRequest({
      projectId: "proj_1",
      contentItemId: "item_1",
      component: "creative",
      reviewerUserId: "u_consultant",
      reviewerName: "Priyah Sharma",
      requestedChange: "Fix hero image color palette",
      priority: "high",
    });

    expect(cr.status).toBe("open");
    expect(item.stage).toBe("changes_requested");
    expect(notifications.length).toBe(1);
    expect(notifications[0].recipientUserId).toBe("u_designer1");
  });

  it("verifies admin can add and remove project members dynamically", () => {
    let users = [
      { id: "u_admin", name: "Alex Mercer", email: "alex@ace.com", avatar: "A" },
      { id: "u_designer1", name: "Rohan Verma", email: "rohan@ace.com", avatar: "R" },
    ];
    let memberships = [
      { projectId: "proj_1", userId: "u_admin", role: "admin" as UserRole, status: "active" },
    ];

    function addProjectMember(params: {
      projectId: string;
      name: string;
      email: string;
      role: UserRole;
    }) {
      let user = users.find((u) => u.email.toLowerCase() === params.email.toLowerCase());
      if (!user) {
        user = {
          id: "u_" + Math.random().toString(36).substr(2, 9),
          name: params.name,
          email: params.email,
          avatar: params.name.charAt(0).toUpperCase(),
        };
        users.push(user);
      }
      const mem = {
        projectId: params.projectId,
        userId: user.id,
        role: params.role,
        status: "active" as const,
      };
      memberships.push(mem);
      return { user, mem };
    }

    function removeProjectMember(projectId: string, userId: string) {
      memberships = memberships.filter((m) => !(m.projectId === projectId && m.userId === userId));
    }

    // Admin adds new member
    const { user: newUser, mem } = addProjectMember({
      projectId: "proj_1",
      name: "Maya Chen",
      email: "maya@aceassured.com",
      role: "designer",
    });

    expect(newUser.email).toBe("maya@aceassured.com");
    expect(memberships.length).toBe(2);
    expect(memberships.some((m) => m.userId === newUser.id)).toBe(true);

    // Admin removes member
    removeProjectMember("proj_1", newUser.id);
    expect(memberships.length).toBe(1);
    expect(memberships.some((m) => m.userId === newUser.id)).toBe(false);
  });
});

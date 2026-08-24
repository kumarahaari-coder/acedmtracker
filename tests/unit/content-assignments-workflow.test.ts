import { describe, it, expect } from "vitest";

interface User {
  id: string;
  name: string;
  role: "admin" | "founder" | "consultant" | "designer";
}

interface ProjectMembership {
  userId: string;
  projectId: string;
  role: string;
  status: "active" | "inactive";
}

interface ContentAssignment {
  id: string;
  projectId: string;
  contentItemId: string;
  assigneeUserId: string;
  assignmentRole: "designer" | "video_editor" | "collaborator";
  status: "assigned" | "accepted" | "in_progress" | "submitted" | "reassigned" | "completed";
  assignedByUserId: string;
  assignedAt: string;
  acceptedAt?: string;
  startedAt?: string;
  completedAt?: string;
  dueAt: string;
  reassignmentReason?: string;
  replacedAssignmentId?: string;
}

interface Deadline {
  id: string;
  projectId: string;
  contentItemId: string;
  kind: "submission";
  dueAt: string;
  status: "on_track" | "approaching" | "overdue";
}

interface Notification {
  userId: string;
  projectId: string;
  type: string;
  message: string;
}

describe("Content Assignment Workflow Unit Suite", () => {
  const members: ProjectMembership[] = [
    { userId: "u_founder", projectId: "proj_1", role: "founder", status: "active" },
    { userId: "u_consultant", projectId: "proj_1", role: "consultant", status: "active" },
    { userId: "u_designer1", projectId: "proj_1", role: "designer", status: "active" },
    { userId: "u_designer2", projectId: "proj_1", role: "designer", status: "active" },
    { userId: "u_outsider", projectId: "proj_2", role: "designer", status: "active" },
  ];

  function canAssign(actorRole: string): boolean {
    return ["admin", "founder", "consultant"].includes(actorRole);
  }

  function isMemberOfProject(userId: string, projectId: string): boolean {
    return members.some((m) => m.userId === userId && m.projectId === projectId && m.status === "active");
  }

  function createAssignment(
    actorUser: User,
    projectId: string,
    contentItemId: string,
    assigneeUserId: string,
    dueAt: string
  ): { assignment: ContentAssignment; deadline: Deadline; notification: Notification } {
    if (!canAssign(actorUser.role)) {
      throw new Error("Unauthorized: Only Admin, Founder, or Consultant can assign content");
    }
    if (!isMemberOfProject(assigneeUserId, projectId)) {
      throw new Error("Invalid Assignee: User is not an active member of this project");
    }

    const assignmentId = `asgn_${Date.now()}`;
    const assignment: ContentAssignment = {
      id: assignmentId,
      projectId,
      contentItemId,
      assigneeUserId,
      assignmentRole: "designer",
      status: "assigned",
      assignedByUserId: actorUser.id,
      assignedAt: new Date().toISOString(),
      dueAt,
    };

    const deadline: Deadline = {
      id: `dl_${Date.now()}`,
      projectId,
      contentItemId,
      kind: "submission",
      dueAt,
      status: "on_track",
    };

    const notification: Notification = {
      userId: assigneeUserId,
      projectId,
      type: "assignment_created",
      message: `You have been assigned to content item ${contentItemId}. Due: ${dueAt}`,
    };

    return { assignment, deadline, notification };
  }

  function reassignContent(
    actorUser: User,
    currentAssignment: ContentAssignment,
    newAssigneeUserId: string,
    reason: string
  ): { previous: ContentAssignment; next: ContentAssignment; notification: Notification } {
    if (!canAssign(actorUser.role)) {
      throw new Error("Unauthorized: Only Admin, Founder, or Consultant can reassign content");
    }
    if (!isMemberOfProject(newAssigneeUserId, currentAssignment.projectId)) {
      throw new Error("Invalid Assignee: User is not an active member of this project");
    }

    const updatedPrevious: ContentAssignment = {
      ...currentAssignment,
      status: "reassigned",
      reassignmentReason: reason,
    };

    const nextAssignment: ContentAssignment = {
      id: `asgn_${Date.now()}_next`,
      projectId: currentAssignment.projectId,
      contentItemId: currentAssignment.contentItemId,
      assigneeUserId: newAssigneeUserId,
      assignmentRole: currentAssignment.assignmentRole,
      status: "assigned",
      assignedByUserId: actorUser.id,
      assignedAt: new Date().toISOString(),
      dueAt: currentAssignment.dueAt,
      reassignmentReason: reason,
      replacedAssignmentId: currentAssignment.id,
    };

    const notification: Notification = {
      userId: newAssigneeUserId,
      projectId: currentAssignment.projectId,
      type: "assignment_created",
      message: `Content item reassigned to you. Reason: ${reason}`,
    };

    return { previous: updatedPrevious, next: nextAssignment, notification };
  }

  it("permits Founder and Consultant to assign and creates submission deadline and notification", () => {
    const founder: User = { id: "u_founder", name: "Vikram", role: "founder" };
    const { assignment, deadline, notification } = createAssignment(
      founder,
      "proj_1",
      "item_101",
      "u_designer1",
      "2026-08-25T18:00:00Z"
    );

    expect(assignment.status).toBe("assigned");
    expect(assignment.assigneeUserId).toBe("u_designer1");
    expect(deadline.kind).toBe("submission");
    expect(deadline.dueAt).toBe("2026-08-25T18:00:00Z");
    expect(notification.userId).toBe("u_designer1");
  });

  it("rejects unauthorized assignment from Designer role or non-member assignee", () => {
    const designer: User = { id: "u_designer1", name: "Rohan", role: "designer" };
    expect(() =>
      createAssignment(designer, "proj_1", "item_101", "u_designer2", "2026-08-25T18:00:00Z")
    ).toThrow(/Unauthorized/);

    const consultant: User = { id: "u_consultant", name: "Dr. Dave", role: "consultant" };
    expect(() =>
      createAssignment(consultant, "proj_1", "item_101", "u_outsider", "2026-08-25T18:00:00Z")
    ).toThrow(/User is not an active member/);
  });

  it("reassignment updates previous status to 'reassigned' and tracks replaced_assignment_id", () => {
    const founder: User = { id: "u_founder", name: "Vikram", role: "founder" };
    const { assignment: initial } = createAssignment(founder, "proj_1", "item_101", "u_designer1", "2026-08-25T18:00:00Z");

    const { previous, next, notification } = reassignContent(
      founder,
      initial,
      "u_designer2",
      "Urgent leave handover"
    );

    expect(previous.status).toBe("reassigned");
    expect(previous.reassignmentReason).toBe("Urgent leave handover");
    expect(next.status).toBe("assigned");
    expect(next.assigneeUserId).toBe("u_designer2");
    expect(next.replacedAssignmentId).toBe(initial.id);
    expect(notification.userId).toBe("u_designer2");
  });

  it("calculates designer workloads and unassigned items accurately", () => {
    const items = [
      { id: "item_1", title: "Post 1" },
      { id: "item_2", title: "Post 2" },
      { id: "item_3", title: "Post 3" },
    ];

    const activeAssignments: ContentAssignment[] = [
      {
        id: "asgn_1",
        projectId: "proj_1",
        contentItemId: "item_1",
        assigneeUserId: "u_designer1",
        assignmentRole: "designer",
        status: "in_progress",
        assignedByUserId: "u_founder",
        assignedAt: "2026-08-21T00:00:00Z",
        dueAt: "2026-08-25T18:00:00Z",
      },
      {
        id: "asgn_2",
        projectId: "proj_1",
        contentItemId: "item_2",
        assigneeUserId: "u_designer1",
        assignmentRole: "designer",
        status: "assigned",
        assignedByUserId: "u_founder",
        assignedAt: "2026-08-21T00:00:00Z",
        dueAt: "2026-08-26T18:00:00Z",
      },
    ];

    const unassigned = items.filter((it) => !activeAssignments.some((a) => a.contentItemId === it.id));
    expect(unassigned.length).toBe(1);
    expect(unassigned[0].id).toBe("item_3");

    const workloadDesigner1 = activeAssignments.filter((a) => a.assigneeUserId === "u_designer1" && ["assigned", "accepted", "in_progress"].includes(a.status));
    expect(workloadDesigner1.length).toBe(2);

    const workloadDesigner2 = activeAssignments.filter((a) => a.assigneeUserId === "u_designer2" && ["assigned", "accepted", "in_progress"].includes(a.status));
    expect(workloadDesigner2.length).toBe(0);
  });
});

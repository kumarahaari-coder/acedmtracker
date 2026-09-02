"use server";

export async function invalidateWorkspaceEntities(options: {
  orgId?: string;
  projectId?: string;
  userId?: string;
  paths?: string[];
  tags?: string[];
}) {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    return;
  }

  try {
    const { revalidatePath, revalidateTag } = await import("next/cache");

    if (options.tags && options.tags.length > 0) {
      for (const tag of options.tags) {
        try {
          revalidateTag(tag);
        } catch (_) {}
      }
    }

    if (options.orgId) {
      try {
        revalidateTag(`org:${options.orgId}`);
      } catch (_) {}
    }

    if (options.projectId) {
      try {
        revalidateTag(`project:${options.projectId}`);
      } catch (_) {}
      try {
        revalidatePath(`/projects/${options.projectId}`, "layout");
      } catch (_) {}
      try {
        revalidatePath(`/portal/${options.projectId}`, "layout");
      } catch (_) {}
    }

    if (options.userId) {
      try {
        revalidateTag(`user:${options.userId}`);
      } catch (_) {}
    }

    const standardPaths = options.paths || ["/"];
    for (const p of standardPaths) {
      try {
        revalidatePath(p);
      } catch (_) {}
    }
  } catch (err) {
    // Non-fatal cache invalidation notice
  }
}

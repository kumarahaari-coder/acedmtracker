import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { creativeAssets } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthoritativeUser, requireProjectAccess } from "@/lib/auth/session";
import { generatePresignedDownloadUrl } from "@/lib/storage/r2";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  try {
    const { assetId } = await params;
    if (!assetId) {
      return NextResponse.json({ error: "Missing assetId" }, { status: 400 });
    }

    // Authenticate user
    const actor = await getAuthoritativeUser();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Query asset
    const [asset] = await db
      .select()
      .from(creativeAssets)
      .where(eq(creativeAssets.id, assetId))
      .limit(1);

    if (!asset || asset.status !== "ready") {
      return NextResponse.json({ error: "Asset not found or not ready" }, { status: 404 });
    }

    // Project access check
    const access = await requireProjectAccess(actor.id, asset.projectId);
    if (!access.allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Generate signed R2 download/preview URL
    const presignedUrl = await generatePresignedDownloadUrl({
      objectKey: asset.r2ObjectKey,
      filename: asset.originalFilename,
      mimeType: asset.mimeType,
      expiresInSeconds: 600, // 10 minutes
      inline: true,
    });

    // 307 Temporary Redirect to R2 signed URL with private cache header
    return NextResponse.redirect(presignedUrl, {
      status: 307,
      headers: {
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err: any) {
    console.error("[AssetPreviewRoute] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

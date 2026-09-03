import { db } from "../db";
import { effortStandards } from "../db/schema/operational";
import { eq, and } from "drizzle-orm";
import { EffortStandard } from "../types";

interface CachedStandards {
  standards: EffortStandard[];
  cachedAt: number;
}

const standardsCache = new Map<string, CachedStandards>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL in Worker isolate

export async function getCachedEffortStandards(orgId: string): Promise<EffortStandard[]> {
  const cached = standardsCache.get(orgId);
  const now = Date.now();

  if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
    return cached.standards;
  }

  const rows = await db
    .select()
    .from(effortStandards)
    .where(and(eq(effortStandards.orgId, orgId), eq(effortStandards.active, true)));

  const standards: EffortStandard[] = rows.map((s) => ({
    id: s.id,
    orgId: s.orgId,
    category: s.category as any,
    workType: s.workType,
    contentSeconds: s.contentSeconds,
    productionSeconds: s.productionSeconds,
    totalSeconds: s.totalSeconds,
    leadTimeWorkdays: s.leadTimeWorkdays,
    defaultRole: s.defaultRole as any,
    active: s.active,
    version: s.version,
    effectiveFrom: s.effectiveFrom.toISOString(),
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }));

  standardsCache.set(orgId, { standards, cachedAt: now });
  return standards;
}

export function invalidateCachedEffortStandards(orgId: string): void {
  standardsCache.delete(orgId);
}

import { SubmissionAsset } from "./types";

// Simple deterministic string hash for prototype fingerprinting
export function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export function computeCopyFingerprint(copy: {
  caption: string;
  hashtags: string[];
  cta: string;
  destinationUrl?: string;
}): string {
  const serialized = JSON.stringify({
    caption: copy.caption.trim(),
    hashtags: copy.hashtags.map(h => h.trim().toLowerCase()).sort(),
    cta: copy.cta.trim(),
    destinationUrl: (copy.destinationUrl || '').trim()
  });
  return 'copy_' + simpleHash(serialized);
}

export function computeCreativeFingerprint(assets: SubmissionAsset[]): string {
  const sorted = [...assets].sort((a, b) => a.assetId.localeCompare(b.assetId));
  const serialized = JSON.stringify(
    sorted.map(a => ({
      id: a.assetId,
      filename: a.filename,
      hash: a.contentHash || a.filename,
      size: a.fileSizeBytes,
      isDrive: !!a.isDriveLink
    }))
  );
  return 'creative_' + simpleHash(serialized);
}

export function computePostingDateFingerprint(scheduledDate?: string): string {
  return 'date_' + simpleHash(scheduledDate || 'unscheduled');
}

export function computeVersionFingerprints(version: {
  copy: { caption: string; hashtags: string[]; cta: string; destinationUrl?: string };
  creativeAssets: SubmissionAsset[];
  scheduledDate?: string;
}) {
  return {
    copyFingerprint: computeCopyFingerprint(version.copy),
    creativeFingerprint: computeCreativeFingerprint(version.creativeAssets),
    postingDateFingerprint: computePostingDateFingerprint(version.scheduledDate)
  };
}

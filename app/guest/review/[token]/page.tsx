"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Image as ImageIcon,
  Lock,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import { verifyExternalReviewTokenAction, postExternalReviewCommentAction } from "@/lib/actions/collaboration";
import { SafeImage } from "@/components/ui/SafeImage";
import { formatDate, formatTime } from "@/lib/formatters";
import { productConfig, organizationConfig } from "@/lib/config/branding";

export default function GuestReviewPage() {
  const params = useParams();
  const token = (params?.token as string) || "";

  const [reviewData, setReviewData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [guestName, setGuestName] = useState("");
  const [commentText, setCommentText] = useState("");
  const [isCommentSubmitted, setIsCommentSubmitted] = useState(false);
  const [comments, setComments] = useState<any[]>([]);

  useEffect(() => {
    let isMounted = true;
    async function resolveToken() {
      if (!token) return;
      setLoading(true);
      const res = await verifyExternalReviewTokenAction(token);
      if (!isMounted) return;
      if (res.success) {
        setReviewData(res);
        setComments(res.comments || []);
        setError(null);
      } else {
        setError(res.error || "Review Link Invalid or Expired");
      }
      setLoading(false);
    }
    resolveToken();
    return () => { isMounted = false; };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center p-6 text-center">
        <div className="text-[15px] font-medium text-[#6e6e73] flex items-center gap-2">
          <Clock className="h-5 w-5 animate-spin text-[#0071e3]" /> Validating External Review Link...
        </div>
      </div>
    );
  }

  if (error || !reviewData) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-[22px] border border-black/[0.08] bg-white p-8 text-center space-y-4 shadow-xl">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#fff0ee] text-[#d70015] mx-auto">
            <Lock className="h-6 w-6" />
          </div>
          <h2 className="text-[20px] font-semibold text-[#1d1d1f]">Review Link Invalid or Expired</h2>
          <p className="text-[14px] text-[#6e6e73] leading-relaxed">
            {error || "This external preview link has either expired, been revoked, or does not exist. Please contact your representative."}
          </p>
        </div>
      </div>
    );
  }

  const { tokenRecord, contentItem, submissionVersion, allowDownload } = reviewData;
  const project = { clientBrand: reviewData.projectName || "Client Project" };
  const version = submissionVersion;
  const reviewLink = tokenRecord || {};
  const externalComments = comments || [];

  const handlePostGuestComment = async () => {
    if (!commentText.trim() || !guestName.trim()) {
      alert("Please provide your name and comment.");
      return;
    }

    const res = await postExternalReviewCommentAction({
      rawToken: token,
      guestName: guestName.trim(),
      commentBody: commentText.trim(),
    });

    if (res.success && res.comment) {
      setComments((prev) => [res.comment, ...prev]);
      setCommentText("");
      setIsCommentSubmitted(true);
      setTimeout(() => setIsCommentSubmitted(false), 3000);
    } else {
      alert(res.error || "Failed to post comment.");
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] flex flex-col font-sans">
      {/* Apple-style Isolated Client Header */}
      <header className="border-b border-black/[0.08] bg-white/90 backdrop-blur-md px-6 sm:px-10 py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1d1d1f] font-semibold text-white text-xs">
            A
          </div>
          <div>
            <div className="text-[15px] font-semibold text-[#1d1d1f]">{project?.clientBrand}</div>
            <div className="text-[11px] text-[#86868b]">Review Portal • {productConfig.poweredBy}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="status-approved rounded-full px-3 py-1 text-[12px] font-medium flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Client Preview Mode
          </span>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 max-w-5xl mx-auto w-full p-6 sm:p-10 space-y-6">
        <div className="pb-4 border-b border-black/[0.06] space-y-1">
          <span className="inline-flex items-center rounded-full bg-[#f2f2f7] px-2.5 py-0.5 text-[11px] font-medium text-[#1d1d1f]">
            {contentItem?.platform} • {contentItem?.contentType}
          </span>
          <h1 className="text-[28px] font-bold text-[#1d1d1f] tracking-tight">{contentItem?.title}</h1>
          <p className="text-[13px] text-[#6e6e73]">
            Reviewing shared <strong>Version {version?.versionNumber}</strong> • Expiry:{" "}
            {formatDate(reviewLink.expiresAt)}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          {/* Creative Media Preview (Col 1-7) */}
          <div className="md:col-span-7 space-y-6">
            <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-[#1d1d1f] text-[15px] flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-[#0071e3]" />
                  Creative Asset
                </h3>
                {reviewLink.allowDownload && (
                  <span className="text-[12px] text-[#86868b]">Download Permitted</span>
                )}
              </div>

              <div className="space-y-3">
                {(!version?.creativeAssets || version.creativeAssets.length === 0) ? (
                  <div className="py-8 text-center text-[13px] text-[#86868b] border border-dashed border-black/[0.1] rounded-2xl p-6 bg-[#fbfbfd]">
                    No creative media attachments for this version.
                  </div>
                ) : (
                  version.creativeAssets.map((asset: any) => {
                    const isVideo = asset.mimeType?.startsWith("video/") || /\.(mp4|mov|webm)$/i.test(asset.filename || "");
                    const isPdf = asset.mimeType === "application/pdf" || (asset.filename || "").toLowerCase().endsWith(".pdf");

                    return (
                      <div key={asset.assetId} className="rounded-2xl border border-black/[0.06] bg-[#f5f5f7] p-2 space-y-2">
                        <div className="overflow-hidden rounded-xl bg-white aspect-video flex items-center justify-center border border-black/[0.06]">
                          {isVideo ? (
                            <video
                              src={asset.previewUrl}
                              controls
                              playsInline
                              preload="metadata"
                              className="w-full h-full object-contain bg-black"
                            />
                          ) : isPdf ? (
                            <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
                              <div className="h-12 w-12 rounded-2xl bg-[#fff0ee] text-[#b42318] flex items-center justify-center font-bold text-[14px] border border-[#ffd5d0]">
                                PDF
                              </div>
                              <span className="text-[13px] font-medium text-[#1d1d1f]">{asset.filename}</span>
                              <a
                                href={asset.previewUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded-full bg-[#1d1d1f] text-white px-4 py-1.5 text-[12px] font-medium hover:bg-black transition inline-flex items-center gap-1.5"
                              >
                                View PDF Document →
                              </a>
                            </div>
                          ) : (
                            <SafeImage
                              src={asset.previewUrl}
                              alt={asset.filename}
                              fallbackTitle={asset.filename || "Creative Preview"}
                              className="w-full h-full object-contain"
                            />
                          )}
                        </div>
                        <div className="flex items-center justify-between text-[12px] px-2 py-1">
                          <span className="font-medium text-[#1d1d1f] truncate max-w-xs">{asset.filename}</span>
                          {reviewLink.allowDownload && asset.previewUrl && (
                            <a
                              href={asset.previewUrl}
                              download={asset.filename}
                              className="font-medium text-[#0066cc] hover:underline flex items-center gap-1"
                            >
                              <Download className="h-3.5 w-3.5" /> Download
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Copy & Captions */}
            <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-4">
              <h3 className="font-semibold text-[#1d1d1f] text-[15px]">
                Caption & Call to Action
              </h3>
              
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block">Caption</span>
                <div className="p-4 rounded-xl bg-[#fbfbfd] border border-black/[0.06] text-[15px] text-[#1d1d1f] whitespace-pre-wrap leading-relaxed">
                  {(version?.copy?.caption || version?.caption) ? (
                    version?.copy?.caption || version?.caption
                  ) : (
                    <span className="text-[#86868b] italic">No caption provided for this version.</span>
                  )}
                </div>
              </div>

              {(version?.copy?.cta || version?.cta) && (
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block">Call to Action (CTA)</span>
                  <div className="p-3 rounded-xl bg-[#f0f7ff] border border-[#d0e5ff] text-[14px] font-medium text-[#0071e3]">
                    {version?.copy?.cta || version?.cta}
                  </div>
                </div>
              )}

              {(version?.copy?.destinationUrl || version?.destinationUrl) && (
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block">Destination Link</span>
                  <a
                    href={version?.copy?.destinationUrl || version?.destinationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[13px] text-[#0066cc] hover:underline block truncate"
                  >
                    {version?.copy?.destinationUrl || version?.destinationUrl}
                  </a>
                </div>
              )}

              {((version?.copy?.hashtags && version.copy.hashtags.length > 0) || (version?.hashtags && version.hashtags.length > 0)) && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block">Hashtags</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(version?.copy?.hashtags || version?.hashtags || []).map((h: string) => (
                      <span key={h} className="rounded-full bg-[#f2f2f7] px-2.5 py-0.5 text-[12px] text-[#0066cc] font-medium">
                        #{h.replace(/^#/, "")}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Feedback & Guest Comments (Col 8-12) */}
          <div className="md:col-span-5 space-y-6">
            <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-4">
              <h3 className="font-semibold text-[#1d1d1f] text-[16px] flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-[#0071e3]" />
                Client Feedback Thread
              </h3>

              {/* Comments Stream */}
              <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                {externalComments.length === 0 ? (
                  <div className="py-8 text-center text-[13px] text-[#86868b]">
                    No client feedback yet. Share your thoughts below.
                  </div>
                ) : (
                  externalComments.map((comm: any) => (
                    <div key={comm.id} className="rounded-xl border border-black/[0.06] bg-[#fbfbfd] p-3.5 text-[13px] space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-[#1d1d1f]">
                          {comm.externalReviewerName || "Client"}
                        </span>
                        <span className="text-[#86868b]">
                          {formatTime(comm.createdAt)}
                        </span>
                      </div>
                      <p className="text-[#6e6e73] leading-relaxed">{comm.body}</p>
                    </div>
                  ))
                )}
              </div>

              {/* Add Comment Form */}
              <div className="space-y-3 pt-3 border-t border-black/[0.06] text-[13px]">
                {isCommentSubmitted && (
                  <div className="rounded-xl bg-[#eaf6ed] border border-[#c4e6cc] p-3 text-[12px] text-[#1f6f32] flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" /> Feedback saved and synced to the agency!
                  </div>
                )}

                <div>
                  <label className="block text-[#1d1d1f] font-medium mb-1">Your Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Dr. Arvind / Marketing Lead"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    className="w-full rounded-xl border border-black/[0.12] bg-white p-2.5 text-[#1d1d1f] focus:outline-none focus:border-[#0071e3]"
                  />
                </div>

                <div>
                  <label className="block text-[#1d1d1f] font-medium mb-1">Feedback / Notes *</label>
                  <textarea
                    rows={3}
                    placeholder="Provide your feedback or approval notes..."
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    className="w-full rounded-xl border border-black/[0.12] bg-white p-2.5 text-[#1d1d1f] focus:outline-none focus:border-[#0071e3]"
                  />
                </div>

                <button
                  onClick={handlePostGuestComment}
                  className="w-full rounded-full bg-[#0071e3] hover:bg-[#0077ed] py-2 text-[14px] font-medium text-white shadow-sm transition"
                >
                  Submit Feedback
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

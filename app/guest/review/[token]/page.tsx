"use client";

import React, { useState } from "react";
import { useParams } from "next/navigation";
import { useAppState } from "@/lib/context/AppStateContext";
import {
  CheckCircle2,
  Download,
  FileText,
  Image as ImageIcon,
  Lock,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import { SafeImage } from "@/components/ui/SafeImage";
import { formatDate, formatTime } from "@/lib/formatters";

export default function GuestReviewPage() {
  const params = useParams();
  const token = (params?.token as string) || "";
  const { state, addComment } = useAppState();

  const [guestName, setGuestName] = useState("");
  const [commentText, setCommentText] = useState("");
  const [isCommentSubmitted, setIsCommentSubmitted] = useState(false);

  // Locate the external review link matching this token
  const reviewLink = state.externalReviewLinks.find((l) => l.demoToken === token && !l.revokedAt);

  if (!reviewLink) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-[22px] border border-black/[0.08] bg-white p-8 text-center space-y-4 shadow-xl">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#fff0ee] text-[#d70015] mx-auto">
            <Lock className="h-6 w-6" />
          </div>
          <h2 className="text-[20px] font-semibold text-[#1d1d1f]">Review Link Invalid or Expired</h2>
          <p className="text-[14px] text-[#6e6e73] leading-relaxed">
            This external preview link has either expired, been revoked, or does not exist. Please contact your Ace Assured representative.
          </p>
        </div>
      </div>
    );
  }

  const project = state.projects.find((p) => p.id === reviewLink.projectId);
  const contentItem = state.contentItems.find((i) => i.id === reviewLink.contentItemId);
  const version = state.submissionVersions.find((v) => v.id === reviewLink.submissionVersionId);

  // External comments ONLY for this version
  const externalComments = state.comments.filter(
    (c) =>
      c.contentItemId === reviewLink.contentItemId &&
      c.submissionVersionId === reviewLink.submissionVersionId &&
      c.visibility === "external"
  );

  const handlePostGuestComment = () => {
    if (!commentText.trim() || !guestName.trim()) {
      alert("Please provide your name and comment.");
      return;
    }

    addComment({
      projectId: reviewLink.projectId,
      contentItemId: reviewLink.contentItemId,
      submissionVersionId: reviewLink.submissionVersionId,
      externalReviewerName: guestName.trim(),
      visibility: "external",
      body: commentText.trim(),
    });

    setCommentText("");
    setIsCommentSubmitted(true);
    setTimeout(() => setIsCommentSubmitted(false), 3000);
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
            <div className="text-[11px] text-[#86868b]">Review Portal • Powered by Ace Assured</div>
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
                {version?.creativeAssets.map((asset) => (
                  <div key={asset.assetId} className="rounded-2xl border border-black/[0.06] bg-[#f5f5f7] p-2 space-y-2">
                    <div className="overflow-hidden rounded-xl bg-white aspect-video flex items-center justify-center border border-black/[0.06]">
                      <SafeImage
                        src={asset.previewUrl}
                        alt={asset.filename}
                        fallbackTitle={asset.filename || "Creative Preview"}
                        className="w-full h-full object-contain"
                      />
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
                ))}
              </div>
            </div>

            {/* Copy & Captions */}
            <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-3">
              <h3 className="font-semibold text-[#1d1d1f] text-[15px]">
                Caption & Call to Action
              </h3>
              <div className="p-4 rounded-xl bg-[#fbfbfd] border border-black/[0.06] text-[15px] text-[#1d1d1f] whitespace-pre-wrap leading-relaxed">
                {version?.copy.caption}
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {version?.copy.hashtags.map((h) => (
                  <span key={h} className="rounded-full bg-[#f2f2f7] px-2.5 py-0.5 text-[12px] text-[#0066cc] font-medium">
                    #{h}
                  </span>
                ))}
              </div>
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
                  externalComments.map((comm) => (
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

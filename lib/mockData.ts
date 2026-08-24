import { AppState } from "./types";
import { computeCopyFingerprint, computeCreativeFingerprint, computePostingDateFingerprint } from "./fingerprints";

export function makeSvgDataUrl(title: string, subtitle = "", bgColor = "#1e1b4b", shapeColor = "#4f46e5"): string {
  const safeTitle = title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeSub = subtitle.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600' viewBox='0 0 800 600'><rect width='800' height='600' fill='${bgColor}'/><circle cx='400' cy='250' r='110' fill='${shapeColor}'/><text x='400' y='420' font-family='sans-serif' font-size='26' font-weight='bold' fill='white' text-anchor='middle'>${safeTitle}</text>${safeSub ? `<text x='400' y='460' font-family='sans-serif' font-size='18' fill='#e2e8f0' text-anchor='middle'>${safeSub}</text>` : ""}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function getInitialDeterministicState(): AppState {
  const v1_copy = {
    caption: "Is your clinic digital-ready? Discover how omnichannel healthcare drives patient trust and retention in 2026. #HealthcareInnovation #DigitalHealth #PatientFirst",
    hashtags: ["healthcareinnovation", "digitalhealth", "patientfirst"],
    cta: "Swipe through to see the 5 key pillars or visit our link in bio.",
    destinationUrl: "https://acmehealth.example.com/omnichannel-guide"
  };
  const v1_assets = [
    {
      assetId: "ast_1",
      filename: "acme_hero_carousel_slide1.png",
      previewUrl: makeSvgDataUrl("Omnichannel Healthcare Guide", "Slide 1: Patient Trust", "#1e1b4b", "#4f46e5"),
      fileSizeBytes: 2450000,
      mimeType: "image/png",
      contentHash: "hash_ast_1_v1"
    },
    {
      assetId: "ast_2",
      filename: "acme_carousel_slide2.png",
      previewUrl: makeSvgDataUrl("5 Critical Touchpoints", "Slide 2: Telehealth & Followups", "#0f172a", "#334155"),
      fileSizeBytes: 2180000,
      mimeType: "image/png",
      contentHash: "hash_ast_2_v1"
    }
  ];
  const v1_date = "2026-08-25T10:00:00.000Z";

  const v2_copy = {
    caption: "Is your clinic modern and digital-ready? Discover how integrated healthcare delivers unmatched patient retention in 2026. #HealthcareInnovation #DigitalHealth #PatientFirst",
    hashtags: ["healthcareinnovation", "digitalhealth", "patientfirst"],
    cta: "Swipe through the 5 pillars below and tap the link in bio to download our playbook!",
    destinationUrl: "https://acmehealth.example.com/playbook"
  };
  const v2_assets = [
    {
      assetId: "ast_1",
      filename: "acme_hero_carousel_slide1_revised.png",
      previewUrl: makeSvgDataUrl("Omnichannel Healthcare Playbook (v2)", "High Contrast Revised Palette", "#1e1b4b", "#10b981"),
      fileSizeBytes: 2550000,
      mimeType: "image/png",
      contentHash: "hash_ast_1_v2"
    }
  ];

  return {
    users: [
      {
        id: "u_admin",
        name: "Alex Mercer",
        email: "alex@aceassured.com",
        avatar: "AM",
        role: "admin",
        jobTitle: "System Administrator",
        status: "active",
        workingHoursPerDay: 8,
        dateJoined: "2025-01-15T00:00:00.000Z",
        createdAt: "2025-01-15T00:00:00.000Z",
        updatedAt: "2026-08-20T00:00:00.000Z",
      },
      {
        id: "u_founder",
        name: "Vikram Shah",
        email: "vikram@aceassured.com",
        avatar: "VS",
        role: "founder",
        jobTitle: "Agency Founder & Managing Partner",
        status: "active",
        workingHoursPerDay: 8,
        dateJoined: "2024-06-01T00:00:00.000Z",
        createdAt: "2024-06-01T00:00:00.000Z",
        updatedAt: "2026-08-20T00:00:00.000Z",
      },
      {
        id: "u_consultant",
        name: "Priyah Sharma",
        email: "priyah@aceassured.com",
        avatar: "PS",
        role: "consultant",
        jobTitle: "Senior Healthcare & Brand Consultant",
        status: "active",
        workingHoursPerDay: 8,
        dateJoined: "2025-03-10T00:00:00.000Z",
        createdAt: "2025-03-10T00:00:00.000Z",
        updatedAt: "2026-08-20T00:00:00.000Z",
      },
      {
        id: "u_designer1",
        name: "Rohan Verma",
        email: "rohan@aceassured.com",
        avatar: "RV",
        role: "designer",
        jobTitle: "Lead Visual & UI Designer",
        status: "active",
        workingHoursPerDay: 8,
        dateJoined: "2025-04-01T00:00:00.000Z",
        createdAt: "2025-04-01T00:00:00.000Z",
        updatedAt: "2026-08-20T00:00:00.000Z",
      },
      {
        id: "u_designer2",
        name: "Ananya Sen",
        email: "ananya@aceassured.com",
        avatar: "AS",
        role: "designer",
        jobTitle: "Senior Motion Graphic & Reel Video Editor",
        status: "active",
        workingHoursPerDay: 8,
        dateJoined: "2025-05-15T00:00:00.000Z",
        createdAt: "2025-05-15T00:00:00.000Z",
        updatedAt: "2026-08-20T00:00:00.000Z",
      },
      {
        id: "u_client_acme",
        name: "Dr. Ramesh Mehta",
        email: "ramesh@acmehealth.com",
        avatar: "RM",
        role: "client",
        jobTitle: "CMO, Acme Health Clinics",
        status: "active",
        workingHoursPerDay: 8,
        dateJoined: "2026-01-10T00:00:00.000Z",
        createdAt: "2026-01-10T00:00:00.000Z",
        updatedAt: "2026-08-20T00:00:00.000Z",
      },
      {
        id: "u_inactive_designer",
        name: "Sameer Khan",
        email: "sameer@aceassured.com",
        avatar: "SK",
        role: "designer",
        jobTitle: "Former Junior Creative Designer",
        status: "inactive",
        workingHoursPerDay: 8,
        dateJoined: "2025-02-01T00:00:00.000Z",
        createdAt: "2025-02-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
      },
    ],
    projectMemberships: [
      { id: "mem_acme_admin", projectId: "proj_acme", userId: "u_admin", status: "active", membershipRole: "admin", addedByUserId: "u_founder", addedAt: "2026-01-15T00:00:00.000Z" },
      { id: "mem_acme_founder", projectId: "proj_acme", userId: "u_founder", status: "active", membershipRole: "founder", addedByUserId: "u_founder", addedAt: "2026-01-15T00:00:00.000Z" },
      { id: "mem_acme_consultant", projectId: "proj_acme", userId: "u_consultant", status: "active", membershipRole: "consultant", addedByUserId: "u_founder", addedAt: "2026-01-15T00:00:00.000Z" },
      { id: "mem_acme_designer1", projectId: "proj_acme", userId: "u_designer1", status: "active", membershipRole: "designer", addedByUserId: "u_consultant", addedAt: "2026-01-15T00:00:00.000Z" },
      { id: "mem_acme_client", projectId: "proj_acme", userId: "u_client_acme", status: "active", membershipRole: "client", addedByUserId: "u_founder", addedAt: "2026-01-16T00:00:00.000Z" },

      { id: "mem_solar_admin", projectId: "proj_solaredge", userId: "u_admin", status: "active", membershipRole: "admin", addedByUserId: "u_founder", addedAt: "2026-02-01T00:00:00.000Z" },
      { id: "mem_solar_founder", projectId: "proj_solaredge", userId: "u_founder", status: "active", membershipRole: "founder", addedByUserId: "u_founder", addedAt: "2026-02-01T00:00:00.000Z" },
      { id: "mem_solar_consultant", projectId: "proj_solaredge", userId: "u_consultant", status: "active", membershipRole: "consultant", addedByUserId: "u_founder", addedAt: "2026-02-01T00:00:00.000Z" },
      { id: "mem_solar_designer2", projectId: "proj_solaredge", userId: "u_designer2", status: "active", membershipRole: "designer", addedByUserId: "u_consultant", addedAt: "2026-02-01T00:00:00.000Z" },

      { id: "mem_int_admin", projectId: "proj_internal", userId: "u_admin", status: "active", membershipRole: "admin", addedByUserId: "u_founder", addedAt: "2026-01-01T00:00:00.000Z" },
      { id: "mem_int_founder", projectId: "proj_internal", userId: "u_founder", status: "active", membershipRole: "founder", addedByUserId: "u_founder", addedAt: "2026-01-01T00:00:00.000Z" },
      { id: "mem_int_consultant", projectId: "proj_internal", userId: "u_consultant", status: "active", membershipRole: "consultant", addedByUserId: "u_founder", addedAt: "2026-01-01T00:00:00.000Z" },
      { id: "mem_int_designer1", projectId: "proj_internal", userId: "u_designer1", status: "active", membershipRole: "designer", addedByUserId: "u_consultant", addedAt: "2026-01-01T00:00:00.000Z" },
      { id: "mem_int_designer2", projectId: "proj_internal", userId: "u_designer2", status: "active", membershipRole: "designer", addedByUserId: "u_consultant", addedAt: "2026-01-01T00:00:00.000Z" },
    ],
    projects: [
      {
        id: "proj_acme",
        name: "Acme Health Omnichannel",
        clientBrand: "Acme Healthcare Pvt Ltd",
        avatar: "AH",
        scope: "Q3 brand awareness, patient education, and lead generation across Instagram and LinkedIn.",
        timezone: "Asia/Kolkata",
        status: "active",
        targetRequirements: { posts: 12, carousels: 8, reels: 10, trialReels: 2 },
        workflowStages: ["Idea", "Draft", "Submitted", "In Review", "Changes Requested", "Approved", "Scheduled", "Published", "Reported"],
        createdAt: "2026-07-01T09:00:00.000Z",
      },
      {
        id: "proj_solaredge",
        name: "SolarEdge Green Energy Launch",
        clientBrand: "SolarEdge Systems Ltd",
        avatar: "SE",
        scope: "B2B commercial solar installation campaign and video case studies.",
        timezone: "Asia/Kolkata",
        status: "active",
        targetRequirements: { posts: 8, carousels: 4, reels: 6, trialReels: 1 },
        workflowStages: ["Idea", "Draft", "Submitted", "In Review", "Changes Requested", "Approved", "Scheduled", "Published", "Reported"],
        createdAt: "2026-07-15T11:00:00.000Z",
      },
      {
        id: "proj_internal",
        name: "Ace Assured Internal Brand",
        clientBrand: "Ace Assured Operations",
        avatar: "AA",
        scope: "Internal agency thought leadership, case study teardowns, and talent recruitment.",
        timezone: "Asia/Kolkata",
        status: "active",
        targetRequirements: { posts: 15, carousels: 5, reels: 12, trialReels: 4 },
        workflowStages: ["Idea", "Draft", "Submitted", "In Review", "Changes Requested", "Approved", "Scheduled", "Published", "Reported"],
        createdAt: "2026-06-01T08:00:00.000Z",
      },
    ],
    campaigns: [
      {
        id: "camp_acme_q3",
        projectId: "proj_acme",
        name: "Q3 Patient Trust Spotlight",
        objective: "Educate clinic owners on patient trust factors and telehealth retention.",
        description: "Focus on interactive carousels and doctor interview reels.",
        status: "active",
        startDate: "2026-08-01",
        endDate: "2026-09-30",
        ownerId: "u_consultant",
      },
      {
        id: "camp_solar_roi",
        projectId: "proj_solaredge",
        name: "Solar ROI for Factories",
        objective: "Demonstrate payback period reduction for industrial solar plants.",
        description: "Infographic carousels and motion explainer videos.",
        status: "active",
        startDate: "2026-08-10",
        endDate: "2026-10-15",
        ownerId: "u_consultant",
      }
    ],
    contentFamilies: [
      {
        id: "fam_patient_guide",
        projectId: "proj_acme",
        campaignId: "camp_acme_q3",
        name: "Patient Retention Framework 2026",
        concept: "Cross-platform adaptation of the 5-pillar patient trust framework."
      }
    ],
    contentItems: [
      {
        id: "item_acme_1",
        projectId: "proj_acme",
        campaignId: "camp_acme_q3",
        contentFamilyId: "fam_patient_guide",
        title: "5 Pillars of Patient Retention in Modern Clinics",
        platform: "Instagram",
        contentType: "carousel",
        stage: "changes_requested",
        accountableOwnerId: "u_designer1",
        collaboratorIds: ["u_consultant"],
        deadlines: {
          submissionDeadline: "2026-08-18T18:00:00.000Z",
          resubmissionDeadline: "2026-08-22T16:00:00.000Z",
          approvalTarget: "2026-08-23T12:00:00.000Z",
          scheduledPublicationDate: "2026-08-25T10:00:00.000Z"
        },
        currentVersionNumber: 2,
        activeDraftVersionId: "ver_acme_1_v2",
        latestSubmittedVersionId: "ver_acme_1_v1",
      },
      {
        id: "item_acme_2",
        projectId: "proj_acme",
        campaignId: "camp_acme_q3",
        contentFamilyId: "fam_patient_guide",
        title: "B2B Medical Director Teardown: Telehealth ROI",
        platform: "LinkedIn",
        contentType: "post",
        stage: "in_review",
        accountableOwnerId: "u_consultant",
        collaboratorIds: ["u_designer1"],
        deadlines: {
          submissionDeadline: "2026-08-20T12:00:00.000Z",
          approvalTarget: "2026-08-22T18:00:00.000Z",
          scheduledPublicationDate: "2026-08-26T09:30:00.000Z"
        },
        currentVersionNumber: 1,
        latestSubmittedVersionId: "ver_acme_2_v1",
      },
      {
        id: "item_acme_3",
        projectId: "proj_acme",
        campaignId: "camp_acme_q3",
        title: "Doctor Interview: Fast-Track Emergency Response",
        platform: "Instagram",
        contentType: "reel",
        stage: "published",
        accountableOwnerId: "u_designer2",
        collaboratorIds: ["u_consultant"],
        deadlines: {
          submissionDeadline: "2026-08-10T18:00:00.000Z",
          scheduledPublicationDate: "2026-08-14T11:00:00.000Z",
          actualPublicationTime: "2026-08-14T11:05:00.000Z"
        },
        currentVersionNumber: 1,
        latestSubmittedVersionId: "ver_acme_3_v1",
        liveUrl: "https://instagram.com/p/C9x81aBqMock"
      },
      {
        id: "item_acme_4",
        projectId: "proj_acme",
        campaignId: "camp_acme_q3",
        title: "Trial Reel: 30-Sec Health Tech Teaser",
        platform: "Instagram",
        contentType: "trial_reel",
        stage: "approved",
        accountableOwnerId: "u_designer2",
        collaboratorIds: ["u_consultant"],
        deadlines: {
          submissionDeadline: "2026-08-15T18:00:00.000Z",
          scheduledPublicationDate: "2026-08-24T15:00:00.000Z"
        },
        currentVersionNumber: 1,
        latestSubmittedVersionId: "ver_acme_4_v1"
      },
      {
        id: "item_solar_1",
        projectId: "proj_solaredge",
        campaignId: "camp_solar_roi",
        title: "Industrial Solar Payback Calculator Breakdown",
        platform: "LinkedIn",
        contentType: "carousel",
        stage: "in_review",
        accountableOwnerId: "u_designer2",
        collaboratorIds: ["u_consultant"],
        deadlines: {
          submissionDeadline: "2026-08-21T18:00:00.000Z",
          approvalTarget: "2026-08-23T18:00:00.000Z",
          scheduledPublicationDate: "2026-08-27T10:00:00.000Z"
        },
        currentVersionNumber: 1,
        latestSubmittedVersionId: "ver_solar_1_v1"
      }
    ],
    submissionVersions: [
      {
        id: "ver_acme_1_v1",
        contentItemId: "item_acme_1",
        versionNumber: 1,
        isDraft: false,
        createdAt: "2026-08-18T14:00:00.000Z",
        submittedAt: "2026-08-18T17:30:00.000Z",
        copy: v1_copy,
        creativeAssets: v1_assets,
        scheduledDate: v1_date,
        componentFingerprints: {
          copyFingerprint: computeCopyFingerprint(v1_copy),
          creativeFingerprint: computeCreativeFingerprint(v1_assets),
          postingDateFingerprint: computePostingDateFingerprint(v1_date)
        }
      },
      {
        id: "ver_acme_1_v2",
        contentItemId: "item_acme_1",
        versionNumber: 2,
        isDraft: true,
        createdAt: "2026-08-20T10:00:00.000Z",
        copy: v2_copy,
        creativeAssets: v2_assets,
        scheduledDate: v1_date,
        componentFingerprints: {
          copyFingerprint: computeCopyFingerprint(v2_copy),
          creativeFingerprint: computeCreativeFingerprint(v2_assets),
          postingDateFingerprint: computePostingDateFingerprint(v1_date)
        }
      },
      {
        id: "ver_acme_2_v1",
        contentItemId: "item_acme_2",
        versionNumber: 1,
        isDraft: false,
        createdAt: "2026-08-19T11:00:00.000Z",
        submittedAt: "2026-08-19T16:00:00.000Z",
        copy: {
          caption: "Why medical directors are prioritizing integrated telehealth platforms in 2026. A detailed ROI breakdown for 500+ bed hospitals.",
          hashtags: ["healthcareroi", "hospitalops", "telehealth"],
          cta: "Read the executive brief in the comments."
        },
        creativeAssets: [
          {
            assetId: "ast_3",
            filename: "telehealth_roi_infographic.png",
            previewUrl: makeSvgDataUrl("Hospital Telehealth ROI", "+34% Net Efficiency", "#047857", "#10b981"),
            fileSizeBytes: 1890000,
            mimeType: "image/png",
            contentHash: "hash_ast_3_v1"
          }
        ],
        scheduledDate: "2026-08-26T09:30:00.000Z",
        componentFingerprints: {
          copyFingerprint: "copy_telehealth_roi",
          creativeFingerprint: "creative_telehealth_roi",
          postingDateFingerprint: "date_telehealth_roi"
        }
      },
      {
        id: "ver_acme_3_v1",
        contentItemId: "item_acme_3",
        versionNumber: 1,
        isDraft: false,
        createdAt: "2026-08-09T10:00:00.000Z",
        submittedAt: "2026-08-10T12:00:00.000Z",
        copy: {
          caption: "Dr. Ankit explains how immediate patient triaging saves lives during golden-hour emergencies. Watch now!",
          hashtags: ["emergencymedicine", "doctorlife", "acmehealth"],
          cta: "Save this reel and share with healthcare professionals."
        },
        creativeAssets: [
          {
            assetId: "ast_4",
            filename: "emergency_interview_teaser.mp4",
            previewUrl: makeSvgDataUrl("Doctor Interview (Reel Video)", "Emergency Medicine", "#831843", "#ec4899"),
            fileSizeBytes: 18450000,
            mimeType: "video/mp4",
            contentHash: "hash_ast_4_v1"
          }
        ],
        scheduledDate: "2026-08-14T11:00:00.000Z",
        componentFingerprints: {
          copyFingerprint: "copy_doctor_interview",
          creativeFingerprint: "creative_doctor_interview",
          postingDateFingerprint: "date_doctor_interview"
        }
      },
      {
        id: "ver_acme_4_v1",
        contentItemId: "item_acme_4",
        versionNumber: 1,
        isDraft: false,
        createdAt: "2026-08-15T09:00:00.000Z",
        submittedAt: "2026-08-15T14:00:00.000Z",
        copy: {
          caption: "Sneak peek of our patient triaging automation. 30 seconds to the future of healthcare.",
          hashtags: ["healthtechtrial", "trialreel"],
          cta: "Drop a comment if your hospital needs this."
        },
        creativeAssets: [
          {
            assetId: "ast_5",
            filename: "trial_teaser.mp4",
            previewUrl: makeSvgDataUrl("Trial Reel Demo", "Patient Automation", "#4338ca", "#6366f1"),
            fileSizeBytes: 12400000,
            mimeType: "video/mp4",
            contentHash: "hash_ast_5_v1"
          }
        ],
        scheduledDate: "2026-08-24T15:00:00.000Z",
        componentFingerprints: {
          copyFingerprint: "copy_trial_teaser",
          creativeFingerprint: "creative_trial_teaser",
          postingDateFingerprint: "date_trial_teaser"
        }
      },
      {
        id: "ver_solar_1_v1",
        contentItemId: "item_solar_1",
        versionNumber: 1,
        isDraft: false,
        createdAt: "2026-08-21T08:00:00.000Z",
        submittedAt: "2026-08-21T11:00:00.000Z",
        copy: {
          caption: "How factory operators cut electricity costs by 48% with commercial rooftop solar. Step-by-step payback schedule.",
          hashtags: ["cleanenergy", "factoryefficiency", "solarpower"],
          cta: "Download the solar tariff calculator from the link below."
        },
        creativeAssets: [
          {
            assetId: "ast_6",
            filename: "solar_calculator_slide1.png",
            previewUrl: makeSvgDataUrl("48% Factory Energy Savings", "Commercial Solar", "#d97706", "#f59e0b"),
            fileSizeBytes: 2890000,
            mimeType: "image/png",
            contentHash: "hash_ast_6_v1"
          }
        ],
        scheduledDate: "2026-08-27T10:00:00.000Z",
        componentFingerprints: {
          copyFingerprint: "copy_solar_calculator",
          creativeFingerprint: "creative_solar_calculator",
          postingDateFingerprint: "date_solar_calculator"
        }
      }
    ],
    approvalDecisions: [
      // ver_acme_1_v1 Decisions
      {
        id: "dec_1",
        projectId: "proj_acme",
        contentItemId: "item_acme_1",
        submissionVersionId: "ver_acme_1_v1",
        component: "copy",
        componentFingerprint: computeCopyFingerprint(v1_copy),
        reviewerUserId: "u_consultant",
        reviewerRole: "consultant",
        decision: "approved",
        note: "Strong messaging and clear CTA.",
        decidedAt: "2026-08-19T09:00:00.000Z"
      },
      {
        id: "dec_2",
        projectId: "proj_acme",
        contentItemId: "item_acme_1",
        submissionVersionId: "ver_acme_1_v1",
        component: "copy",
        componentFingerprint: computeCopyFingerprint(v1_copy),
        reviewerUserId: "u_founder",
        reviewerRole: "founder",
        decision: "approved",
        note: "Approved copy.",
        decidedAt: "2026-08-19T10:30:00.000Z"
      },
      {
        id: "dec_3",
        projectId: "proj_acme",
        contentItemId: "item_acme_1",
        submissionVersionId: "ver_acme_1_v1",
        component: "creative",
        componentFingerprint: computeCreativeFingerprint(v1_assets),
        reviewerUserId: "u_consultant",
        reviewerRole: "consultant",
        decision: "changes_requested",
        note: "Slide 1 contrast is low against dark background. Needs accessible color contrast.",
        decidedAt: "2026-08-19T09:15:00.000Z"
      },
      {
        id: "dec_4",
        projectId: "proj_acme",
        contentItemId: "item_acme_1",
        submissionVersionId: "ver_acme_1_v1",
        component: "creative",
        componentFingerprint: computeCreativeFingerprint(v1_assets),
        reviewerUserId: "u_founder",
        reviewerRole: "founder",
        decision: "changes_requested",
        note: "Agree with Priyah. Increase text size on slide 2.",
        decidedAt: "2026-08-19T10:45:00.000Z"
      },
      {
        id: "dec_5",
        projectId: "proj_acme",
        contentItemId: "item_acme_1",
        submissionVersionId: "ver_acme_1_v1",
        component: "posting_date",
        componentFingerprint: computePostingDateFingerprint(v1_date),
        reviewerUserId: "u_consultant",
        reviewerRole: "consultant",
        decision: "approved",
        decidedAt: "2026-08-19T09:20:00.000Z"
      },
      {
        id: "dec_6",
        projectId: "proj_acme",
        contentItemId: "item_acme_1",
        submissionVersionId: "ver_acme_1_v1",
        component: "posting_date",
        componentFingerprint: computePostingDateFingerprint(v1_date),
        reviewerUserId: "u_founder",
        reviewerRole: "founder",
        decision: "approved",
        decidedAt: "2026-08-19T11:00:00.000Z"
      },

      // ver_acme_2_v1 Decisions
      {
        id: "dec_7",
        projectId: "proj_acme",
        contentItemId: "item_acme_2",
        submissionVersionId: "ver_acme_2_v1",
        component: "copy",
        componentFingerprint: "copy_telehealth_roi",
        reviewerUserId: "u_consultant",
        reviewerRole: "consultant",
        decision: "approved",
        decidedAt: "2026-08-20T10:00:00.000Z"
      },
      {
        id: "dec_8",
        projectId: "proj_acme",
        contentItemId: "item_acme_2",
        submissionVersionId: "ver_acme_2_v1",
        component: "creative",
        componentFingerprint: "creative_telehealth_roi",
        reviewerUserId: "u_consultant",
        reviewerRole: "consultant",
        decision: "approved",
        decidedAt: "2026-08-20T10:05:00.000Z"
      },

      // ver_acme_4_v1 Decisions (All Approved)
      {
        id: "dec_9",
        projectId: "proj_acme",
        contentItemId: "item_acme_4",
        submissionVersionId: "ver_acme_4_v1",
        component: "copy",
        componentFingerprint: "copy_trial_teaser",
        reviewerUserId: "u_consultant",
        reviewerRole: "consultant",
        decision: "approved",
        decidedAt: "2026-08-16T10:00:00.000Z"
      },
      {
        id: "dec_10",
        projectId: "proj_acme",
        contentItemId: "item_acme_4",
        submissionVersionId: "ver_acme_4_v1",
        component: "copy",
        componentFingerprint: "copy_trial_teaser",
        reviewerUserId: "u_founder",
        reviewerRole: "founder",
        decision: "approved",
        decidedAt: "2026-08-16T11:00:00.000Z"
      },
      {
        id: "dec_11",
        projectId: "proj_acme",
        contentItemId: "item_acme_4",
        submissionVersionId: "ver_acme_4_v1",
        component: "creative",
        componentFingerprint: "creative_trial_teaser",
        reviewerUserId: "u_consultant",
        reviewerRole: "consultant",
        decision: "approved",
        decidedAt: "2026-08-16T10:15:00.000Z"
      },
      {
        id: "dec_12",
        projectId: "proj_acme",
        contentItemId: "item_acme_4",
        submissionVersionId: "ver_acme_4_v1",
        component: "creative",
        componentFingerprint: "creative_trial_teaser",
        reviewerUserId: "u_founder",
        reviewerRole: "founder",
        decision: "approved",
        decidedAt: "2026-08-16T11:15:00.000Z"
      },
      {
        id: "dec_13",
        projectId: "proj_acme",
        contentItemId: "item_acme_4",
        submissionVersionId: "ver_acme_4_v1",
        component: "posting_date",
        componentFingerprint: "date_trial_teaser",
        reviewerUserId: "u_consultant",
        reviewerRole: "consultant",
        decision: "approved",
        decidedAt: "2026-08-16T10:30:00.000Z"
      },
      {
        id: "dec_14",
        projectId: "proj_acme",
        contentItemId: "item_acme_4",
        submissionVersionId: "ver_acme_4_v1",
        component: "posting_date",
        componentFingerprint: "date_trial_teaser",
        reviewerUserId: "u_founder",
        reviewerRole: "founder",
        decision: "approved",
        decidedAt: "2026-08-16T11:30:00.000Z"
      }
    ],
    founderOverrides: [],
    changeRequests: [
      {
        id: "cr_1",
        projectId: "proj_acme",
        contentItemId: "item_acme_1",
        submissionVersionId: "ver_acme_1_v1",
        component: "creative",
        reviewerUserId: "u_consultant",
        reviewerName: "Priyah Sharma (Consultant)",
        requestedChange: "Slide 1 contrast is too low for accessibility. Update the hero circle to high-contrast emerald or teal.",
        priority: "high",
        status: "addressed",
        designerResponse: {
          text: "Updated Slide 1 with high contrast emerald background palette #10b981 and increased font size.",
          addressedInVersionId: "ver_acme_1_v2",
          respondedAt: "2026-08-20T11:00:00.000Z"
        },
        createdAt: "2026-08-19T09:15:00.000Z"
      },
      {
        id: "cr_2",
        projectId: "proj_acme",
        contentItemId: "item_acme_1",
        submissionVersionId: "ver_acme_1_v1",
        component: "creative",
        reviewerUserId: "u_founder",
        reviewerName: "Vikram Shah (Founder)",
        requestedChange: "Increase caption font size on slide 2 by at least 4px so it is readable on mobile screens.",
        priority: "medium",
        status: "addressed",
        designerResponse: {
          text: "Bumped typography to 24px and centered alignment for mobile viewports.",
          addressedInVersionId: "ver_acme_1_v2",
          respondedAt: "2026-08-20T11:15:00.000Z"
        },
        createdAt: "2026-08-19T10:45:00.000Z"
      }
    ],
    comments: [
      {
        id: "comm_1",
        projectId: "proj_acme",
        contentItemId: "item_acme_1",
        submissionVersionId: "ver_acme_1_v1",
        authorUserId: "u_consultant",
        visibility: "internal",
        body: "Please review the copy CTA vs the client website landing page.",
        createdAt: "2026-08-19T08:45:00.000Z"
      },
      {
        id: "comm_2",
        projectId: "proj_acme",
        contentItemId: "item_acme_1",
        submissionVersionId: "ver_acme_1_v1",
        externalReviewerName: "Dr. Arvind (Acme Client Lead)",
        visibility: "external",
        body: "The framework looks great! Let's make sure the logo is visible on the last slide.",
        createdAt: "2026-08-19T14:30:00.000Z"
      }
    ],
    annotations: [
      {
        id: "ann_1",
        projectId: "proj_acme",
        commentId: "comm_1",
        assetId: "ast_1",
        type: "region",
        x: 250,
        y: 200,
        width: 300,
        height: 120
      }
    ],
    deadlineRecords: [
      {
        id: "dl_1",
        projectId: "proj_acme",
        contentItemId: "item_acme_1",
        kind: "submission",
        dueAt: "2026-08-18T18:00:00.000Z",
        completedAt: "2026-08-18T17:30:00.000Z",
        changedByUserId: "u_consultant",
        changeReason: "Initial brief assignment",
        createdAt: "2026-08-14T10:00:00.000Z"
      },
      {
        id: "dl_2",
        projectId: "proj_acme",
        contentItemId: "item_acme_1",
        kind: "resubmission",
        dueAt: "2026-08-22T16:00:00.000Z",
        changedByUserId: "u_consultant",
        changeReason: "Changes requested on creative assets",
        createdAt: "2026-08-19T11:30:00.000Z"
      }
    ],
    publicationRecords: [
      {
        id: "pub_1",
        projectId: "proj_acme",
        contentItemId: "item_acme_3",
        submissionVersionId: "ver_acme_3_v1",
        liveUrl: "https://instagram.com/p/C9x81aBqMock",
        publishedAt: "2026-08-14T11:05:00.000Z",
        markedPublishedByUserId: "u_consultant",
        externalEditOccurred: false
      }
    ],
    externalReviewLinks: [
      {
        id: "ext_1",
        projectId: "proj_acme",
        contentItemId: "item_acme_1",
        submissionVersionId: "ver_acme_1_v1",
        demoToken: "token_demo_acme_guest_7721",
        expiresAt: "2026-09-01T23:59:59.000Z",
        allowDownload: true,
        createdByUserId: "u_consultant",
        createdAt: "2026-08-19T12:00:00.000Z"
      }
    ],
    notifications: [
      {
        id: "notif_1",
        projectId: "proj_acme",
        recipientUserId: "u_designer1",
        eventType: "changes_requested",
        entityType: "content_item",
        entityId: "item_acme_1",
        title: "Changes Requested on 5 Pillars Carousel",
        message: "Priyah and Vikram requested modifications on Creative assets. Resubmission due Aug 22, 16:00 IST.",
        createdAt: "2026-08-19T11:00:00.000Z",
        readAt: "2026-08-19T11:30:00.000Z"
      },
      {
        id: "notif_2",
        projectId: "proj_acme",
        recipientUserId: "u_founder",
        eventType: "submission",
        entityType: "content_item",
        entityId: "item_acme_2",
        title: "New Item Awaiting Approval",
        message: "B2B Medical Director Teardown was submitted by Priyah Sharma. Ready for Founder review.",
        createdAt: "2026-08-19T16:05:00.000Z"
      },
      {
        id: "notif_3",
        projectId: "proj_acme",
        recipientUserId: "u_designer1",
        eventType: "deadline_reminder_4h",
        entityType: "content_item",
        entityId: "item_acme_1",
        title: "4-Hour Deadline Reminder",
        message: "Resubmission for 5 Pillars Carousel is due in 4 hours.",
        createdAt: "2026-08-22T12:00:00.000Z"
      }
    ],
    importBatches: [
      {
        id: "imp_batch_1",
        projectId: "proj_acme",
        filename: "acme_august_meta_insights.csv",
        status: "committed",
        mapping: { "Post URL": "liveUrl", "Reach": "reach", "Engagement": "engagementRate", "Leads": "leads", "Revenue": "revenue" },
        validRowCount: 12,
        invalidRowCount: 0,
        duplicateRowCount: 0,
        createdAt: "2026-08-18T16:00:00.000Z"
      }
    ],
    scripts: [
      {
        id: "scr_1",
        projectId: "proj_acme",
        title: "Doctor Interview: Emergency Triaging Teardown",
        campaignId: "camp_acme_q3",
        platform: "Instagram",
        status: "linked",
        hook: "What if 3 minutes could save 40% of emergency room delays?",
        scenes: [
          { sceneNumber: 1, visual: "Close-up of Dr. Ankit walking through ICU corridor", audio: "Every second in an emergency room counts. But traditional paper intake bottlenecks care." },
          { sceneNumber: 2, visual: "Screen demo showing 1-tap digital triaging app on tablet", audio: "With Acme Instant Triaging, vital signs and insurance clear in under 90 seconds." },
          { sceneNumber: 3, visual: "Doctor smiling, patient wheeled safely into operation theatre", audio: "That's how modern hospitals cut mortality and double patient satisfaction." }
        ],
        cta: "Tap the link in bio to read our hospital operations whitepaper.",
        notes: "Shoot on 4K 24fps with cinematic depth of field. Use hospital brand overlays.",
        linkedContentItemId: "item_acme_3",
        updatedAt: "2026-08-08T14:00:00.000Z"
      },
      {
        id: "scr_2",
        projectId: "proj_acme",
        title: "Reel Concept: Why Waiting Rooms Are Dying in 2026",
        campaignId: "camp_acme_q3",
        platform: "Instagram",
        status: "ready",
        hook: "Nobody likes waiting 45 minutes to see a doctor for 5 minutes.",
        scenes: [
          { sceneNumber: 1, visual: "Frustrated patient checking watch in crowded waiting room", audio: "The average OPD waiting time in metropolitan hospitals is 52 minutes." },
          { sceneNumber: 2, visual: "Virtual queue notification buzzing on smartphone", audio: "Virtual queueing alerts you 10 minutes before the doctor is ready. Zero waiting room stress." }
        ],
        cta: "Follow Acme Health for more healthcare innovation tips.",
        notes: "Motion graphic text animations needed for statistics.",
        updatedAt: "2026-08-16T11:00:00.000Z"
      }
    ],
    assets: [
      {
        id: "ast_1",
        projectId: "proj_acme",
        name: "acme_hero_carousel_slide1.png",
        fileSizeBytes: 2450000,
        mimeType: "image/png",
        isDriveLink: false,
        previewUrl: makeSvgDataUrl("Omnichannel Slide 1", "Hero Branding", "#1e1b4b", "#4f46e5"),
        uploadedByUserId: "u_designer1",
        createdAt: "2026-08-18T13:00:00.000Z",
        tags: ["carousel", "hero", "branding"]
      },
      {
        id: "ast_drive_1",
        projectId: "proj_acme",
        name: "Acme Master Brand Video Raw Footage 4K (Google Drive)",
        fileSizeBytes: 4800000000, // 4.8 GB
        mimeType: "video/quicktime",
        isDriveLink: true,
        driveUrl: "https://drive.google.com/drive/folders/1AcmeHealthRawFootage2026",
        previewUrl: makeSvgDataUrl("Google Drive Master Folder", "4.8 GB External Raw Footage", "#0f766e", "#14b8a6"),
        uploadedByUserId: "u_designer2",
        createdAt: "2026-08-12T10:00:00.000Z",
        tags: ["google_drive", "raw_footage", "b-roll"]
      }
    ],
    analyticsSnapshots: [
      {
        id: "snap_1",
        projectId: "proj_acme",
        contentItemId: "item_acme_3",
        snapshotDate: "2026-08-16",
        platform: "Instagram",
        reach: 18400,
        impressions: 24200,
        engagementRate: 6.8,
        clicks: 840,
        leads: 42,
        revenue: 126000,
        importBatchId: "imp_batch_1"
      },
      {
        id: "snap_2",
        projectId: "proj_acme",
        contentItemId: "item_acme_3",
        snapshotDate: "2026-08-18",
        platform: "Instagram",
        reach: 34500,
        impressions: 48100,
        engagementRate: 7.4,
        clicks: 1620,
        leads: 88,
        revenue: 264000,
        importBatchId: "imp_batch_1"
      }
    ],
    auditRecords: [
      {
        id: "aud_1",
        projectId: "proj_acme",
        actorUserId: "u_consultant",
        actorName: "Priyah Sharma",
        actorRole: "consultant",
        action: "create_content_item",
        entityType: "content_item",
        entityId: "item_acme_1",
        timestamp: "2026-08-14T10:00:00.000Z",
        summary: "Created content item '5 Pillars of Patient Retention in Modern Clinics' and assigned to Rohan Verma.",
        before: null,
        after: { stage: "draft", assignedTo: "u_designer1" }
      },
      {
        id: "aud_2",
        projectId: "proj_acme",
        actorUserId: "u_designer1",
        actorName: "Rohan Verma",
        actorRole: "designer",
        action: "submit_version",
        entityType: "submission_version",
        entityId: "ver_acme_1_v1",
        timestamp: "2026-08-18T17:30:00.000Z",
        summary: "Submitted version 1 of '5 Pillars of Patient Retention in Modern Clinics'.",
        before: { isDraft: true },
        after: { isDraft: false, versionNumber: 1 }
      },
      {
        id: "aud_3",
        projectId: "proj_acme",
        actorUserId: "u_consultant",
        actorName: "Priyah Sharma",
        actorRole: "consultant",
        action: "approval_decision",
        entityType: "approval_decision",
        entityId: "dec_3",
        timestamp: "2026-08-19T09:15:00.000Z",
        summary: "Consultant requested changes on Creative for version 1. Reason: Slide 1 contrast is low.",
        before: { decision: "pending" },
        after: { decision: "changes_requested" }
      },
      {
        id: "aud_4",
        projectId: "proj_acme",
        actorUserId: "u_founder",
        actorName: "Vikram Shah",
        actorRole: "founder",
        action: "approval_decision",
        entityType: "approval_decision",
        entityId: "dec_4",
        timestamp: "2026-08-19T10:45:00.000Z",
        summary: "Founder requested changes on Creative for version 1. Reason: Increase text size on slide 2.",
        before: { decision: "pending" },
        after: { decision: "changes_requested" }
      }
    ]
  };
}

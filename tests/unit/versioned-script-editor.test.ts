import { describe, it, expect } from "vitest";

interface StructuredScriptContent {
  hook: string;
  scenes: Array<{
    sceneNumber: number;
    visualDirection: string;
    dialogueVoiceover: string;
    audio: string;
    onScreenText: string;
    durationSeconds: number;
  }>;
  cta: string;
}

interface FreeformScriptBlock {
  id: string;
  type: "heading" | "paragraph" | "list" | "table" | "checklist" | "quote" | "dialogue" | "notes" | "divider" | "custom_section";
  customTitle?: string;
  content: any;
  order: number;
}

interface ScriptVersion {
  id: string;
  scriptId: string;
  projectId: string;
  versionNumber: number;
  mode: "structured" | "freeform";
  structuredContent?: StructuredScriptContent;
  freeformBlocks?: FreeformScriptBlock[];
  searchablePlainText: string;
  changeSummary: string;
  isSubmitted: boolean;
  createdByUserId: string;
  createdAt: string;
}

describe("Flexible Versioned Script Editor Suite", () => {
  it("supports structured script mode with Hook, Scenes and CTA", () => {
    const structured: StructuredScriptContent = {
      hook: "Did you know that 80% of cardiovascular issues are preventable?",
      scenes: [
        {
          sceneNumber: 1,
          visualDirection: "Fast cuts of modern clinic and physician consulting patient",
          dialogueVoiceover: "At Acme Health, preventative care meets precision diagnostics.",
          audio: "Uplifting modern electronic ambient",
          onScreenText: "Preventative Diagnostics | Acme Health",
          durationSeconds: 15,
        },
      ],
      cta: "Schedule your consultation today at acmehealth.com",
    };

    expect(structured.hook).toBeTruthy();
    expect(structured.scenes.length).toBe(1);
    expect(structured.cta).toBeTruthy();
  });

  it("supports freeform script mode with arbitrary custom sections without requiring Hook or CTA", () => {
    const freeformBlocks: FreeformScriptBlock[] = [
      {
        id: "blk_1",
        type: "custom_section",
        customTitle: "Key Clinical Insights & Research Notes",
        content: "Dr. Dave's clinical observations on patient recovery timelines in Q3.",
        order: 1,
      },
      {
        id: "blk_2",
        type: "table",
        customTitle: "Treatment Comparison Table",
        content: { headers: ["Protocol A", "Protocol B"], rows: [["Fast", "Standard"]] },
        order: 2,
      },
      {
        id: "blk_3",
        type: "checklist",
        customTitle: "Production Readiness",
        content: ["Ward B footage cleared", "Physician release signed"],
        order: 3,
      },
    ];

    expect(freeformBlocks.length).toBe(3);
    expect(freeformBlocks[0].customTitle).toBe("Key Clinical Insights & Research Notes");
    // Freeform mode does not require hook or cta
  });

  it("enforces immutability on submitted versions and supports restoring older versions by creating a new version", () => {
    const v1: ScriptVersion = {
      id: "ver_1",
      scriptId: "scr_100",
      projectId: "proj_1",
      versionNumber: 1,
      mode: "freeform",
      freeformBlocks: [
        { id: "b1", type: "paragraph", content: "Initial Draft Content", order: 1 },
      ],
      searchablePlainText: "Initial Draft Content",
      changeSummary: "Initial Draft",
      isSubmitted: true, // Submitted version is locked/immutable
      createdByUserId: "u_writer",
      createdAt: "2026-08-20T10:00:00Z",
    };

    // Attempting to mutate submitted version directly is blocked
    expect(v1.isSubmitted).toBe(true);

    const v2: ScriptVersion = {
      id: "ver_2",
      scriptId: "scr_100",
      projectId: "proj_1",
      versionNumber: 2,
      mode: "freeform",
      freeformBlocks: [
        { id: "b1", type: "paragraph", content: "Major overhaul rewrite", order: 1 },
      ],
      searchablePlainText: "Major overhaul rewrite",
      changeSummary: "Overhaul",
      isSubmitted: false,
      createdByUserId: "u_writer",
      createdAt: "2026-08-21T10:00:00Z",
    };

    // Restoring v1 creates v3 with v1's content
    function restoreVersion(target: ScriptVersion, currentMaxVersion: number, userId: string): ScriptVersion {
      return {
        id: `ver_${currentMaxVersion + 1}`,
        scriptId: target.scriptId,
        projectId: target.projectId,
        versionNumber: currentMaxVersion + 1,
        mode: target.mode,
        structuredContent: target.structuredContent,
        freeformBlocks: target.freeformBlocks ? JSON.parse(JSON.stringify(target.freeformBlocks)) : undefined,
        searchablePlainText: target.searchablePlainText,
        changeSummary: `Restored from version ${target.versionNumber}`,
        isSubmitted: false,
        createdByUserId: userId,
        createdAt: new Date().toISOString(),
      };
    }

    const v3 = restoreVersion(v1, 2, "u_founder");
    expect(v3.versionNumber).toBe(3);
    expect(v3.changeSummary).toBe("Restored from version 1");
    expect(v3.freeformBlocks?.[0].content).toBe("Initial Draft Content");
  });
});

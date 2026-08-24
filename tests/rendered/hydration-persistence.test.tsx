import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToString } from "react-dom/server";
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { AppStateProvider } from "@/lib/context/AppStateContext";
import { RoleProvider } from "@/lib/context/RoleContext";
import GuestReviewPage from "@/app/guest/review/[token]/page";
import { STORAGE_KEY, LEGACY_STORAGE_KEY_V1, CURRENT_SCHEMA_VERSION, loadStoredState } from "@/lib/migrations";
import { getInitialDeterministicState } from "@/lib/mockData";

// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Mock useParams
vi.mock("next/navigation", () => ({
  useParams: () => ({ token: "token_demo_acme_guest_7721" }),
}));

describe("Hydration & Storage Persistence Regression Suite", () => {
  let consoleErrors: string[] = [];
  let consoleWarns: string[] = [];
  const originalError = console.error;
  const originalWarn = console.warn;

  beforeEach(() => {
    consoleErrors = [];
    consoleWarns = [];
    console.error = (...args: any[]) => {
      const msg = args.map(a => String(a)).join(" ");
      consoleErrors.push(msg);
      originalError(...args);
    };
    console.warn = (...args: any[]) => {
      const msg = args.map(a => String(a)).join(" ");
      consoleWarns.push(msg);
      originalWarn(...args);
    };
    localStorage.clear();
  });

  afterEach(() => {
    console.error = originalError;
    console.warn = originalWarn;
  });

  it("server-renders and client-hydrates identically without mismatch warnings when localStorage differs from baseline", async () => {
    // 1. Seed localStorage with customized/persisted state
    const customState = getInitialDeterministicState();
    customState.contentItems[0].title = "Custom User Modified Headline for Clinic Success";

    const customEnvelope = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      seededAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      data: customState,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customEnvelope));

    // 2. Perform Server-Side Render (SSR)
    const ssrHtml = renderToString(
      <AppStateProvider>
        <RoleProvider>
          <GuestReviewPage />
        </RoleProvider>
      </AppStateProvider>
    );

    expect(ssrHtml).toContain("5 Pillars of Patient Retention"); // SSR uses deterministic baseline

    // 3. Hydrate on Client
    const container = document.createElement("div");
    container.innerHTML = ssrHtml;
    document.body.appendChild(container);

    let root: any;
    await act(async () => {
      root = hydrateRoot(
        container,
        <AppStateProvider>
          <RoleProvider>
            <GuestReviewPage />
          </RoleProvider>
        </AppStateProvider>
      );
    });

    // 4. Assert ZERO hydration warnings
    const hydrationErrors = consoleErrors.filter(
      (msg) =>
        msg.includes("Hydration failed") ||
        msg.includes("React will try to recreate this tree from the scratch") ||
        msg.includes("Text content did not match") ||
        msg.includes("Prop `src` did not match")
    );
    expect(hydrationErrors).toHaveLength(0);

    // 5. Assert persisted state updated after mount useEffect
    expect(container.textContent).toContain("Custom User Modified Headline for Clinic Success");

    // Clean up
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("migrates legacy schema v1 storage with unencoded SVG previewUrls seamlessly to v2", () => {
    const legacyState = getInitialDeterministicState();
    // Simulate legacy unencoded URL containing raw ampersand
    legacyState.submissionVersions[0].creativeAssets[1].previewUrl =
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'><text>Slide 2: Telehealth & Followups</text></svg>";

    const legacyEnvelope = {
      schemaVersion: 1,
      seededAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      data: legacyState,
    };
    localStorage.setItem(LEGACY_STORAGE_KEY_V1, JSON.stringify(legacyEnvelope));

    const migrationResult = loadStoredState();

    expect(migrationResult.migrated).toBe(true);
    expect(migrationResult.recoveredFromCorrupted).toBe(false);

    const migratedUrl = migrationResult.state.submissionVersions[0].creativeAssets[1].previewUrl;
    expect(migratedUrl).toContain("data:image/svg+xml;utf8,");
    expect(migratedUrl).not.toContain(" & ");
    expect(migratedUrl).toContain(encodeURIComponent("<svg"));

    // Verify written to v2 storage
    const v2Raw = localStorage.getItem(STORAGE_KEY);
    expect(v2Raw).not.toBeNull();
  });
});

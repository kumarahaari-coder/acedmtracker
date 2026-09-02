import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToString } from "react-dom/server";
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { AppStateProvider } from "@/lib/context/AppStateContext";
import { RoleProvider } from "@/lib/context/RoleContext";
import GuestReviewPage from "@/app/guest/review/[token]/page";
import { STORAGE_KEY, LEGACY_STORAGE_KEY_V1, loadStoredState } from "@/lib/migrations";
import { getInitialDeterministicState } from "@/lib/mockData";

// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Mock useParams
vi.mock("next/navigation", () => ({
  useParams: () => ({ token: "token_demo_acme_guest_7721" }),
}));

describe("Authoritative PostgreSQL Hydration & Storage Purge Suite", () => {
  let consoleErrors: string[] = [];
  let consoleWarns: string[] = [];
  const originalError = console.error;
  const originalWarn = console.warn;

  beforeEach(() => {
    consoleErrors = [];
    consoleWarns = [];
    console.error = (...args: any[]) => {
      const msg = args.map((a) => String(a)).join(" ");
      consoleErrors.push(msg);
      originalError(...args);
    };
    console.warn = (...args: any[]) => {
      const msg = args.map((a) => String(a)).join(" ");
      consoleWarns.push(msg);
      originalWarn(...args);
    };
    localStorage.clear();
  });

  afterEach(() => {
    console.error = originalError;
    console.warn = originalWarn;
  });

  it("purges old prototype localStorage keys and never resurrects synthetic sample data", () => {
    // 1. Seed localStorage with legacy prototype envelope
    const mockEnvelope = {
      schemaVersion: 1,
      seededAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      data: getInitialDeterministicState(),
    };
    localStorage.setItem(LEGACY_STORAGE_KEY_V1, JSON.stringify(mockEnvelope));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mockEnvelope));

    // 2. Execute authoritative loader
    const res = loadStoredState();

    // 3. Verify clean empty state returned & storage purged
    expect(res.state.projects).toHaveLength(0);
    expect(res.state.contentItems).toHaveLength(0);
    expect(localStorage.getItem(LEGACY_STORAGE_KEY_V1)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("server-renders and client-hydrates without mismatch warnings", async () => {
    // 1. Perform Server-Side Render (SSR)
    const ssrHtml = renderToString(
      <AppStateProvider>
        <RoleProvider>
          <GuestReviewPage />
        </RoleProvider>
      </AppStateProvider>
    );

    // 2. Hydrate on Client
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

    // 3. Assert ZERO hydration errors
    const hydrationErrors = consoleErrors.filter(
      (msg) =>
        msg.includes("Hydration failed") ||
        msg.includes("React will try to recreate this tree from the scratch") ||
        msg.includes("Text content did not match") ||
        msg.includes("Prop `src` did not match")
    );
    expect(hydrationErrors).toHaveLength(0);

    // Clean up
    act(() => {
      root.unmount();
    });
    container.remove();
  });
});

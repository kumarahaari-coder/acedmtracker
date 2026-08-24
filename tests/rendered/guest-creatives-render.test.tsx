import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SafeImage } from "@/components/ui/SafeImage";
import { makeSvgDataUrl } from "@/lib/mockData";
import { AppStateProvider } from "@/lib/context/AppStateContext";
import { RoleProvider } from "@/lib/context/RoleContext";
import GuestReviewPage from "@/app/guest/review/[token]/page";

// Mock useParams for Next.js
vi.mock("next/navigation", () => ({
  useParams: () => ({ token: "token_demo_acme_guest_7721" }),
}));

describe("Rendered Guest Creatives & SafeImage Resilience", () => {
  it("renders valid SVG creative asset without falling back to error state", () => {
    const validUrl = makeSvgDataUrl("5 Critical Touchpoints", "Slide 2: Telehealth & Followups", "#0f172a", "#334155");

    const { container } = render(
      <SafeImage
        src={validUrl}
        alt="acme_carousel_slide2.png"
        fallbackTitle="acme_carousel_slide2.png"
      />
    );

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toContain("data:image/svg+xml;utf8,");
    expect(screen.queryByTestId("safe-image-fallback")).toBeNull();
  });

  it("displays designed graceful fallback when image source triggers runtime error", () => {
    const { container } = render(
      <SafeImage
        src="data:image/svg+xml;utf8,<invalid_unclosed_broken_svg"
        alt="broken_image.png"
        fallbackTitle="broken_image.png"
      />
    );

    const img = container.querySelector("img");
    expect(img).not.toBeNull();

    // Trigger onError
    fireEvent.error(img!);

    expect(screen.getByTestId("safe-image-fallback")).toBeDefined();
    expect(screen.getByText("broken_image.png")).toBeDefined();
    expect(screen.getByText("Preview Unavailable")).toBeDefined();
    expect(container.querySelector("img")).toBeNull();
  });

  it("handles image failure occurring before hydration (naturalWidth === 0)", () => {
    const { container, rerender } = render(
      <SafeImage
        src="https://example.com/missing-asset.png"
        alt="prehydration_failure.png"
        fallbackTitle="prehydration_failure.png"
      />
    );

    const img = container.querySelector("img");
    if (img) {
      Object.defineProperty(img, "naturalWidth", { value: 0, configurable: true });
      Object.defineProperty(img, "complete", { value: true, configurable: true });
    }

    // Trigger load with naturalWidth === 0
    if (img) fireEvent.load(img);

    expect(screen.getByTestId("safe-image-fallback")).toBeDefined();
    expect(screen.getByText("prehydration_failure.png")).toBeDefined();
  });

  it("renders GuestReviewPage and displays all seeded creative assets cleanly", () => {
    const { container } = render(
      <AppStateProvider>
        <RoleProvider>
          <GuestReviewPage />
        </RoleProvider>
      </AppStateProvider>
    );

    // Verify client portal header
    expect(screen.getByText("Acme Healthcare Pvt Ltd")).toBeDefined();
    expect(screen.getByText("Client Preview Mode")).toBeDefined();

    // Verify both creative slide assets are rendered
    expect(screen.getByText("acme_hero_carousel_slide1.png")).toBeDefined();
    expect(screen.getByText("acme_carousel_slide2.png")).toBeDefined();

    // Verify images rendered with valid encoded data URLs
    const images = container.querySelectorAll("img");
    expect(images.length).toBeGreaterThanOrEqual(2);
    images.forEach((img) => {
      expect(img.getAttribute("src")).toContain("data:image/svg+xml;utf8,");
      // Must not contain raw unencoded &
      expect(img.getAttribute("src")).not.toContain(" & ");
    });

    // Verify absence of internal dashboard elements
    expect(screen.queryByText("Role Simulation")).toBeNull();
    expect(screen.queryByText("Reset Sample Data")).toBeNull();
    expect(screen.queryByText("SolarEdge Green Energy Launch")).toBeNull();
  });
});

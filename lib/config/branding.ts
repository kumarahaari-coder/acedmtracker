/**
 * Centralized Product & Organisation Identity Configuration
 *
 * Identity Hierarchy:
 * 1. PRODUCT: AceCore (Working product presentation identity / Software platform)
 * 2. ORGANISATION: Ace Assured (Operating organisation / Agency workspace owner)
 * 3. CLIENT / PROJECT: Project-specific client identities (e.g. Pink Palms, Acme Healthcare)
 *
 * Changing product identity (e.g. for future commercial SaaS rebranding)
 * requires updating only this file without altering organization context or data models.
 */

export const productConfig = {
  name: "AceCore",
  shortName: "AceCore",
  description: "Project Operations",
  fullTitle: "AceCore — Project Operations",
  wordmarkPrefix: "Ace",
  wordmarkSuffix: "Core",
  poweredBy: "Powered by AceCore",
  version: "1.0.0-rc",
} as const;

export const organizationConfig = {
  name: "Ace Assured",
  shortName: "Ace Assured",
  descriptor: "Marketing Operations",
  domain: "aceassured.com",
  defaultTimezone: "Asia/Kolkata",
  managedBy: "Managed by Ace Assured",
} as const;

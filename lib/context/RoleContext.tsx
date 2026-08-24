"use client";

import React, { createContext, useContext, useState } from "react";
import { UserRole } from "../types";

export interface RoleCapabilities {
  canCreateProjects: boolean;
  canManageWorkflow: boolean;
  canUploadCreative: boolean;
  canRespondToChanges: boolean;
  canApprove: boolean;
  canOverride: boolean;
  canManagePublication: boolean;
  canManageAnalytics: boolean;
  canViewCommercialMetrics: boolean;
  canManageRetention: boolean;
  canManageTeamMembers: boolean;
  canInactivateMembers: boolean;
  canViewAuditHistory: boolean;
  canViewDesignerPerformance: boolean;
  isClientRole: boolean;
}

interface RoleContextType extends RoleCapabilities {
  activeRole: UserRole;
  activeUserId: string;
  activeProjectId: string;
  setActiveRole: (role: UserRole) => void;
  setActiveUserId: (userId: string) => void;
  setActiveProjectId: (projectId: string) => void;
  // Legacy aliases for backwards compatibility
  canEdit: boolean;
  canAdmin: boolean;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function getRoleCapabilities(role: UserRole): RoleCapabilities {
  switch (role) {
    case "admin":
      return {
        canCreateProjects: true,
        canManageWorkflow: true,
        canUploadCreative: true,
        canRespondToChanges: true,
        canApprove: false, // Operational override only
        canOverride: false,
        canManagePublication: true,
        canManageAnalytics: true,
        canViewCommercialMetrics: true,
        canManageRetention: true,
        canManageTeamMembers: true,
        canInactivateMembers: true,
        canViewAuditHistory: true,
        canViewDesignerPerformance: true,
        isClientRole: false,
      };
    case "founder":
      return {
        canCreateProjects: true,
        canManageWorkflow: true,
        canUploadCreative: true,
        canRespondToChanges: true,
        canApprove: true,
        canOverride: true,
        canManagePublication: true,
        canManageAnalytics: true,
        canViewCommercialMetrics: true,
        canManageRetention: false,
        canManageTeamMembers: true,
        canInactivateMembers: true,
        canViewAuditHistory: true,
        canViewDesignerPerformance: true,
        isClientRole: false,
      };
    case "consultant":
      return {
        canCreateProjects: true,
        canManageWorkflow: true,
        canUploadCreative: true,
        canRespondToChanges: true,
        canApprove: true,
        canOverride: false,
        canManagePublication: true,
        canManageAnalytics: true,
        canViewCommercialMetrics: true,
        canManageRetention: false,
        canManageTeamMembers: false, // Read-only team viewer
        canInactivateMembers: false,
        canViewAuditHistory: true,
        canViewDesignerPerformance: true,
        isClientRole: false,
      };
    case "designer":
      return {
        canCreateProjects: false,
        canManageWorkflow: false,
        canUploadCreative: true,
        canRespondToChanges: true,
        canApprove: false,
        canOverride: false,
        canManagePublication: false,
        canManageAnalytics: false, // Strictly excluded
        canViewCommercialMetrics: false, // Strictly masked
        canManageRetention: false,
        canManageTeamMembers: false,
        canInactivateMembers: false,
        canViewAuditHistory: false, // 403 Forbidden
        canViewDesignerPerformance: false, // 403 Forbidden
        isClientRole: false,
      };
    case "client":
      return {
        canCreateProjects: false,
        canManageWorkflow: false,
        canUploadCreative: false,
        canRespondToChanges: false,
        canApprove: false,
        canOverride: false,
        canManagePublication: false,
        canManageAnalytics: true, // Scoped whitelisted metrics only
        canViewCommercialMetrics: false,
        canManageRetention: false,
        canManageTeamMembers: false,
        canInactivateMembers: false,
        canViewAuditHistory: false,
        canViewDesignerPerformance: false,
        isClientRole: true,
      };
  }
}

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [activeRole, setActiveRoleState] = useState<UserRole>("founder");
  const [activeUserId, setActiveUserId] = useState<string>("u_founder");
  const [activeProjectId, setActiveProjectId] = useState<string>("proj_acme");

  const setActiveRole = (role: UserRole) => {
    setActiveRoleState(role);
    if (role === "admin") setActiveUserId("u_admin");
    else if (role === "founder") setActiveUserId("u_founder");
    else if (role === "consultant") setActiveUserId("u_consultant");
    else if (role === "designer") setActiveUserId("u_designer1");
    else if (role === "client") setActiveUserId("u_client_acme");
  };

  const capabilities = getRoleCapabilities(activeRole);

  return (
    <RoleContext.Provider
      value={{
        activeRole,
        activeUserId,
        activeProjectId,
        setActiveRole,
        setActiveUserId,
        setActiveProjectId,
        ...capabilities,
        canEdit: activeRole !== "client",
        canAdmin: activeRole === "admin" || activeRole === "founder",
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error("useRole must be used within a RoleProvider");
  }
  return context;
}

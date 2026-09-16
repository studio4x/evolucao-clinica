// Individual approval/subscription is not an enterprise entitlement. Only an
// already server-resolved, active organization context permits this exception.
export function canEnterInvitedClinic(input: {
  pathname: string; featureEnabled: boolean; contextStatus: string; contextUserId: string | null;
  userId: string; activeContext: { type: string; organizationId?: string }; organizations: { id: string }[];
}) {
  const clinicPath = input.pathname === "/painel/clinica" || input.pathname.startsWith("/painel/clinica/");
  return clinicPath && input.featureEnabled && input.contextStatus === "ready"
    && input.contextUserId === input.userId && input.activeContext.type === "organization"
    && input.organizations.some((org) => org.id === input.activeContext.organizationId);
}

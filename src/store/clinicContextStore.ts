import { create } from "zustand";
import { ClinicContextApiError, fetchClinicContexts, type ClinicOrganization } from "../services/clinicContext";

export type ActiveClinicContext =
  | { type: "personal" }
  | { type: "organization"; organizationId: string };

type ClinicContextStatus = "idle" | "loading" | "ready" | "error";

type ClinicContextState = {
  organizations: ClinicOrganization[];
  activeContext: ActiveClinicContext;
  status: ClinicContextStatus;
  error: string | null;
  hydratedAt: number | null;
  userId: string | null;
  hydrateForUser: (userId: string, accessToken: string) => Promise<void>;
  revalidateForUser: (userId: string, accessToken: string) => Promise<void>;
  selectContext: (context: ActiveClinicContext) => void;
  reset: () => void;
};

const storagePrefix = "evolucao-clinica:context:";
let inFlight: Promise<void> | null = null;
let inFlightUserId: string | null = null;
const revalidationInFlight = new Map<string, Promise<void>>();

function storageKey(userId: string) {
  return `${storagePrefix}${userId}`;
}

function readStoredOrganizationId(userId: string) {
  if (typeof window === "undefined") return null;
  try {
    const value = window.sessionStorage.getItem(storageKey(userId));
    if (!value) return null;
    const parsed = JSON.parse(value) as { type?: string; organizationId?: unknown };
    return parsed.type === "organization" && typeof parsed.organizationId === "string" ? parsed.organizationId : null;
  } catch {
    return null;
  }
}

function writeStoredContext(userId: string, context: ActiveClinicContext) {
  if (typeof window === "undefined") return;
  try {
    if (context.type === "personal") {
      window.sessionStorage.removeItem(storageKey(userId));
    } else {
      window.sessionStorage.setItem(storageKey(userId), JSON.stringify(context));
    }
  } catch {
    // A private browsing/sessionStorage failure must not prevent personal access.
  }
}

function clearStoredContext(userId: string | null) {
  if (!userId || typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(storageKey(userId));
  } catch {
    // Best effort only.
  }
}

function personalState(userId: string | null = null) {
  return {
    organizations: [],
    activeContext: { type: "personal" as const },
    status: "idle" as const,
    error: null,
    hydratedAt: null,
    userId,
  };
}

export const useClinicContextStore = create<ClinicContextState>((set, get) => ({
  ...personalState(),

  hydrateForUser: async (userId, accessToken) => {
    if (inFlight && inFlightUserId === userId) return inFlight;

    clearStoredContext(get().userId && get().userId !== userId ? get().userId : null);
    set({ organizations: [], userId, status: "loading", error: null, activeContext: { type: "personal" } });

    inFlightUserId = userId;
    inFlight = (async () => {
      try {
        const payload = await fetchClinicContexts(accessToken);
        if (get().userId !== userId) return;

        const organizations = payload.organizations.filter(
          (organization) => Boolean(organization.id) && organization.operationalStatus !== "archived",
        );
        const storedOrganizationId = readStoredOrganizationId(userId);
        const restoredOrganization = organizations.find(({ id }) => id === storedOrganizationId);
        const activeContext: ActiveClinicContext = restoredOrganization
          ? { type: "organization", organizationId: restoredOrganization.id }
          : { type: "personal" };

        if (!restoredOrganization && storedOrganizationId) writeStoredContext(userId, { type: "personal" });
        set({ organizations, activeContext, status: "ready", error: null, hydratedAt: Date.now() });
      } catch (error) {
        if (get().userId !== userId) return;
        const code = error instanceof ClinicContextApiError ? error.code : "context_resolution_failed";
        // A disabled backend flag is an expected personal-only state, not an app error.
        if (error instanceof ClinicContextApiError && error.code === "feature_unavailable") {
          set({ ...personalState(userId), status: "ready", hydratedAt: Date.now() });
          return;
        }
        set({ ...personalState(userId), status: "error", error: code, hydratedAt: Date.now() });
      } finally {
        if (inFlightUserId === userId) {
          inFlight = null;
          inFlightUserId = null;
        }
      }
    })();

    return inFlight;
  },

  revalidateForUser: async (userId, accessToken) => {
    const existingRevalidation = revalidationInFlight.get(userId);
    if (existingRevalidation) return existingRevalidation;
    if (get().userId !== userId) return;

    const pendingHydration = inFlight && inFlightUserId === userId ? inFlight : null;
    const revalidation = (async () => {
      if (pendingHydration) await pendingHydration;
      if (get().userId !== userId) return;
      await get().hydrateForUser(userId, accessToken);
    })();

    revalidationInFlight.set(userId, revalidation);
    try {
      await revalidation;
    } finally {
      if (revalidationInFlight.get(userId) === revalidation) revalidationInFlight.delete(userId);
    }
  },

  selectContext: (context) => {
    const userId = get().userId;
    if (!userId || context.type === "personal") {
      if (userId) writeStoredContext(userId, { type: "personal" });
      set({ activeContext: { type: "personal" } });
      return;
    }

    const organization = get().organizations.find(({ id }) => id === context.organizationId);
    if (!organization) return;
    const selected = { type: "organization" as const, organizationId: organization.id };
    writeStoredContext(userId, selected);
    set({ activeContext: selected });
  },

  reset: () => {
    clearStoredContext(get().userId);
    set(personalState());
  },
}));

export function clinicContextStorageKey(userId: string) {
  return storageKey(userId);
}

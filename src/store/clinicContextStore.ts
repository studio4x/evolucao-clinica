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
  refreshAfterMutation: (userId: string, accessToken: string) => Promise<void>;
  hydrateAcceptedClinicContext: (userId: string, accessToken: string, organizationId: string) => Promise<void>;
  selectContext: (context: ActiveClinicContext) => void;
  reset: () => void;
};

const storagePrefix = "evolucao-clinica:context:";
type HydrationRequest = { userId: string; generation: number; promise: Promise<void> };
let inFlight: HydrationRequest | null = null;
const revalidationInFlight = new Map<string, Promise<void>>();
const generationByUser = new Map<string, number>();

function currentGeneration(userId: string) {
  return generationByUser.get(userId) ?? 0;
}

function advanceGeneration(userId: string) {
  const next = currentGeneration(userId) + 1;
  generationByUser.set(userId, next);
  return next;
}

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
    const previousUserId = get().userId;
    if (previousUserId && previousUserId !== userId) advanceGeneration(previousUserId);
    const generation = currentGeneration(userId);
    if (inFlight && inFlight.userId === userId && inFlight.generation === generation) return inFlight.promise;

    clearStoredContext(previousUserId && previousUserId !== userId ? previousUserId : null);
    set({ organizations: [], userId, status: "loading", error: null, activeContext: { type: "personal" } });

    let request!: Promise<void>;
    request = (async () => {
      try {
        const payload = await fetchClinicContexts(accessToken);
        if (get().userId !== userId || currentGeneration(userId) !== generation) return;

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
        if (get().userId !== userId || currentGeneration(userId) !== generation) return;
        const code = error instanceof ClinicContextApiError ? error.code : "context_resolution_failed";
        // A disabled backend flag is an expected personal-only state, not an app error.
        if (error instanceof ClinicContextApiError && error.code === "feature_unavailable") {
          set({ ...personalState(userId), status: "ready", hydratedAt: Date.now() });
          return;
        }
        set({ ...personalState(userId), status: "error", error: code, hydratedAt: Date.now() });
      } finally {
        if (inFlight?.promise === request) inFlight = null;
      }
    })();

    inFlight = { userId, generation, promise: request };
    return request;
  },

  revalidateForUser: async (userId, accessToken) => {
    if (get().userId !== userId) return;
    const existingRevalidation = revalidationInFlight.get(userId);
    if (existingRevalidation) return existingRevalidation;
    const generation = currentGeneration(userId);

    const pendingHydration = inFlight?.userId === userId ? inFlight.promise : null;
    const revalidation = (async () => {
      if (pendingHydration) await pendingHydration;
      if (get().userId !== userId || currentGeneration(userId) !== generation) return;
      await get().hydrateForUser(userId, accessToken);
    })();

    revalidationInFlight.set(userId, revalidation);
    try {
      await revalidation;
    } finally {
      if (revalidationInFlight.get(userId) === revalidation) revalidationInFlight.delete(userId);
    }
  },

  refreshAfterMutation: async (userId, accessToken) => {
    const currentUserId = get().userId;
    if (currentUserId !== null && currentUserId !== userId) return;
    advanceGeneration(userId);
    revalidationInFlight.delete(userId);
    await get().hydrateForUser(userId, accessToken);
  },

  hydrateAcceptedClinicContext: async (userId, accessToken, organizationId) => {
    // Acceptance is a deliberate account transition. Invalidate any context
    // request that started before the mutation, including a stale account's
    // response, without weakening the normal race guard used elsewhere.
    const currentUserId = get().userId;
    if (currentUserId && currentUserId !== userId) {
      advanceGeneration(currentUserId);
      clearStoredContext(currentUserId);
      set(personalState(userId));
    }
    advanceGeneration(userId);
    revalidationInFlight.delete(userId);
    await get().hydrateForUser(userId, accessToken);

    const hasOrganization = () => {
      const state = get();
      return state.userId === userId && state.status === "ready"
        && state.organizations.some((organization) => organization.id === organizationId);
    };

    // The invitation transaction and the authenticated context read can cross
    // a replica boundary. Allow one bounded retry, never a polling loop.
    if (!hasOrganization()) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      advanceGeneration(userId);
      await get().hydrateForUser(userId, accessToken);
    }

    if (!hasOrganization()) throw new Error("context_unavailable");
    get().selectContext({ type: "organization", organizationId });
    const selected = get().activeContext;
    if (selected.type !== "organization" || selected.organizationId !== organizationId) {
      throw new Error("context_unavailable");
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
    const userId = get().userId;
    if (userId) advanceGeneration(userId);
    revalidationInFlight.clear();
    clearStoredContext(userId);
    set(personalState());
  },
}));

export function clinicContextStorageKey(userId: string) {
  return storageKey(userId);
}

import { mapState, getUserProfile } from "./lifecycleRepository.js";
import type { LifecycleDependencies, LifecycleState } from "./lifecycleTypes.js";

export async function recalculateLifecycleUserState(deps: LifecycleDependencies, userId: string): Promise<LifecycleState> {
  const profile = await getUserProfile(deps, userId);
  if (!profile) throw new Error("Profissional não encontrado.");

  const { data, error } = await deps.supabaseAdmin.rpc("recalculate_lifecycle_user_state", { target_user_id: userId });
  if (error) throw new Error(error.message || "Falha ao recalcular estado lifecycle via RPC.");

  return {
    ...mapState(data),
    fullName: profile.full_name || "Profissional",
    email: profile.google_email || "",
    profession: profile.professional_title || ""
  };
}

export async function getOrRecalculateLifecycleState(deps: LifecycleDependencies, userId: string): Promise<LifecycleState> {
  const existing = await deps.supabaseAdmin.from("lifecycle_user_state").select("*").eq("user_id", userId).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (!existing.data) return recalculateLifecycleUserState(deps, userId);
  const profile = await getUserProfile(deps, userId);
  return { ...mapState(existing.data), fullName: profile?.full_name || "Profissional", email: profile?.google_email || "", profession: profile?.professional_title || "" };
}

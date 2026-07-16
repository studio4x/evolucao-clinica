export type LifecycleEmailSource = "lifecycle" | "lifecycle-conditional" | "lifecycle-test";

export type LifecycleEmailDeliveryResult = {
  provider: "smtp" | "brevo";
  messageId: string | null;
  emailDeliveryId: string | null;
};

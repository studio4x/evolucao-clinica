export function getSequenceIntervalMinutes(currentWaitMinutes: unknown, nextWaitMinutes: unknown): number {
  const current = Math.max(0, Number(currentWaitMinutes || 0));
  const next = Math.max(0, Number(nextWaitMinutes || 0));
  return Math.max(0, next - current);
}

export function calculateNextSequenceStepAt(
  reference: Date,
  currentWaitMinutes: unknown,
  nextWaitMinutes: unknown
): Date {
  return new Date(reference.getTime() + getSequenceIntervalMinutes(currentWaitMinutes, nextWaitMinutes) * 60000);
}

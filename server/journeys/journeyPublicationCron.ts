export const JOURNEY_PUBLICATION_CRON_JOB = "publish-journey-contents-job";

export type JourneyPublicationCronRun = {
  status: string;
  startTime: string;
  endTime: string | null;
  returnMessage: string | null;
};

export function getNextJourneyPublicationCronRun(schedule: string, now = new Date()) {
  const match = /^\*\/(\d+) \* \* \* \*$/.exec(schedule.trim());
  if (!match) return null;

  const intervalMinutes = Number(match[1]);
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 60) return null;

  const next = new Date(now);
  next.setUTCSeconds(0, 0);
  next.setUTCMinutes(Math.floor(now.getUTCMinutes() / intervalMinutes) * intervalMinutes + intervalMinutes);
  return next.toISOString();
}

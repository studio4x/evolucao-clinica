export type PatientSessionScheduleEntry = {
  weekday: number;
  time: string;
};

export type PatientSessionSuggestion = PatientSessionScheduleEntry & {
  date: string;
  weekdayLabel: string;
};

export const PATIENT_SESSION_WEEKDAYS = [
  { value: 1, short: 'Seg', label: 'Segunda-feira' },
  { value: 2, short: 'Ter', label: 'Terça-feira' },
  { value: 3, short: 'Qua', label: 'Quarta-feira' },
  { value: 4, short: 'Qui', label: 'Quinta-feira' },
  { value: 5, short: 'Sex', label: 'Sexta-feira' },
  { value: 6, short: 'Sáb', label: 'Sábado' },
  { value: 0, short: 'Dom', label: 'Domingo' },
] as const;

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const normalizeTime = (value: unknown) => {
  const raw = String(value || '').trim();
  const short = raw.length >= 5 ? raw.slice(0, 5) : raw;
  return TIME_PATTERN.test(short) ? short : '';
};

export const normalizePatientSessionSchedule = (
  value: unknown,
  legacyDays: unknown = [],
  legacyTime: unknown = null
): PatientSessionScheduleEntry[] => {
  let source: unknown = value;
  if (typeof source === 'string') {
    try { source = JSON.parse(source); } catch { source = []; }
  }

  let entries: PatientSessionScheduleEntry[] = [];
  if (Array.isArray(source)) {
    entries = source
      .map((item: any) => ({
        weekday: Number(item?.weekday),
        time: normalizeTime(item?.time),
      }))
      .filter((item) => Number.isInteger(item.weekday) && item.weekday >= 0 && item.weekday <= 6 && Boolean(item.time));
  }

  if (entries.length === 0) {
    const time = normalizeTime(legacyTime);
    const days = Array.isArray(legacyDays)
      ? legacyDays.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
      : [];
    if (time) entries = days.map((weekday) => ({ weekday, time }));
  }

  const seen = new Set<string>();
  return entries
    .filter((item) => {
      const key = `${item.weekday}|${item.time}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time));
};

export const sessionScheduleToLegacy = (schedule: PatientSessionScheduleEntry[]) => {
  const normalized = normalizePatientSessionSchedule(schedule);
  return {
    sessionDays: Array.from(new Set(normalized.map((item) => item.weekday))).sort((a, b) => a - b),
    sessionTime: normalized[0]?.time || null,
  };
};

export const getPatientSessionWeekdayLabel = (weekday: number) =>
  PATIENT_SESSION_WEEKDAYS.find((item) => item.value === weekday)?.label || 'Dia não informado';

export const getPatientSessionSlotsForDate = (
  schedule: PatientSessionScheduleEntry[],
  date: Date
) => normalizePatientSessionSchedule(schedule).filter((item) => item.weekday === date.getDay());

const localIsoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const buildPatientSessionSuggestions = (
  schedule: PatientSessionScheduleEntry[],
  month: Date,
  existingSessions: Array<{ sessionDate: string; sessionTime?: string | null }>
): PatientSessionSuggestion[] => {
  const normalized = normalizePatientSessionSchedule(schedule);
  if (normalized.length === 0) return [];

  const existing = new Set(
    existingSessions.map((session) => `${session.sessionDate}|${String(session.sessionTime || '').slice(0, 5)}`)
  );
  const suggestions: PatientSessionSuggestion[] = [];
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, monthIndex, day);
    const dateKey = localIsoDate(date);
    for (const slot of normalized) {
      if (slot.weekday !== date.getDay()) continue;
      if (existing.has(`${dateKey}|${slot.time}`)) continue;
      suggestions.push({
        ...slot,
        date: dateKey,
        weekdayLabel: getPatientSessionWeekdayLabel(slot.weekday),
      });
    }
  }

  return suggestions.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
};

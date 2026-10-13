import { parseWhen } from '../concierge/rulePlanner';

export { maintenanceDue, nextVisitDue, reminderTimes, scheduledMatchingStart } from './scheduling';

export function parseWhenSafe(text: string, now: Date): Date | null {
  return parseWhen(text, now);
}

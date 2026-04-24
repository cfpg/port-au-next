import { CronExpressionParser } from 'cron-parser';
import { MIN_CRON_INTERVAL_MS } from '../constants.js';

/** 6-field cron: second minute hour day month weekday (SOW §6). Ensures minimum interval >= 10s over a lookahead window. */
export function validateCronExpression(expression: string, timezone: string): { ok: true } | { ok: false; reason: string } {
  try {
    const expr = CronExpressionParser.parse(expression, { tz: timezone });
    let prev = expr.next();
    const maxSteps = 200;
    for (let i = 0; i < maxSteps; i++) {
      const next = expr.next();
      const delta = next.getTime() - prev.getTime();
      if (delta < MIN_CRON_INTERVAL_MS) {
        return {
          ok: false,
          reason: `Cron fires more often than every ${MIN_CRON_INTERVAL_MS / 1000} seconds (observed ${delta}ms)`,
        };
      }
      prev = next;
    }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Invalid cron expression' };
  }

  return { ok: true };
}

/** All fire instants strictly after `lower` and <= `upper`, in chronological order. */
export function fireTimesBetween(expression: string, timezone: string, lower: Date, upper: Date): Date[] {
  const out: Date[] = [];
  const expr = CronExpressionParser.parse(expression, {
    tz: timezone,
    currentDate: new Date(lower.getTime() + 1),
  });

  for (let i = 0; i < 5000; i++) {
    const next = expr.next();
    if (next.getTime() > upper.getTime()) break;
    if (next.getTime() > lower.getTime()) out.push(next.toDate());
  }
  return out;
}

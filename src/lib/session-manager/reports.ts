import outline from '../sessions/outline';
import { parseSessionReport, reportTotals, type SessionReport } from '../session-report';
import type { summarizeUsage } from '../usage';
import { scheduleAnonymousSync } from '../anonymous-sync';

export interface SavedSessionReport extends SessionReport {
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  usage: ReturnType<typeof summarizeUsage>;
  totalTimeSeconds: number | null;
  totalTokens: number;
  totalEstimatedCostUsd: number;
}

export interface SessionReportEntry {
  path: string;
  generatedAt: string;
  report: SavedSessionReport;
}

const reportsKey = 'sunny-session-reports';

function isDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isUsageSummary(value: unknown): value is SavedSessionReport['usage'] {
  if (!value || typeof value !== 'object') return false;
  const fields = ['requests', 'inputTokens', 'outputTokens', 'audioSeconds', 'estimatedCostUsd'];
  const hasNumbers = (item: object, keys: string[]) =>
    keys.every((key) => {
      if (!(key in item)) return false;
      const number = Reflect.get(item, key);
      return typeof number === 'number' && Number.isFinite(number) && number >= 0;
    });
  if (
    !hasNumbers(value, [
      ...fields,
      'unknownCosts',
      'unknownTokenRequests',
      'estimatedTokenRequests',
    ]) ||
    !('services' in value) ||
    !Array.isArray(value.services)
  )
    return false;
  return value.services.every(
    (service: unknown) =>
      !!service &&
      typeof service === 'object' &&
      'service' in service &&
      (service.service === 'stt' || service.service === 'llm' || service.service === 'tts') &&
      hasNumbers(service, fields),
  );
}

function readReports(): SessionReportEntry[] {
  const stored = localStorage.getItem(reportsKey);
  if (stored === null) return [];
  const entries: unknown = JSON.parse(stored);
  if (!Array.isArray(entries)) throw new Error('Saved session reports are invalid.');
  return entries.map((entry: unknown) => {
    if (
      !entry ||
      typeof entry !== 'object' ||
      !('path' in entry) ||
      typeof entry.path !== 'string' ||
      !outline.some((session) => session.path === entry.path) ||
      !('generatedAt' in entry) ||
      !isDate(entry.generatedAt) ||
      !('report' in entry) ||
      !entry.report ||
      typeof entry.report !== 'object'
    ) {
      throw new Error('Saved session report is invalid.');
    }
    const report = entry.report;
    if (
      !('name' in report) ||
      !('summary' in report) ||
      !('rank' in report) ||
      !('comments' in report) ||
      !('firstTimestamp' in report) ||
      !(report.firstTimestamp === null || isDate(report.firstTimestamp)) ||
      !('lastTimestamp' in report) ||
      !(report.lastTimestamp === null || isDate(report.lastTimestamp)) ||
      !('usage' in report) ||
      !isUsageSummary(report.usage)
    ) {
      throw new Error('Saved session report is invalid.');
    }
    const fields = parseSessionReport(
      JSON.stringify({
        name: report.name,
        summary: report.summary,
        rank: report.rank,
        comments: report.comments,
      }),
    );
    return {
      path: entry.path,
      generatedAt: entry.generatedAt,
      report: {
        ...fields,
        firstTimestamp: report.firstTimestamp,
        lastTimestamp: report.lastTimestamp,
        usage: report.usage,
        ...reportTotals(
          { firstTimestamp: report.firstTimestamp, lastTimestamp: report.lastTimestamp },
          report.usage,
        ),
      },
    };
  });
}

export function saveSessionReport(path: string, report: SavedSessionReport): void {
  if (!outline.some((session) => session.path === path)) {
    throw new Error('The report session is not in the outline.');
  }
  const reports = readReports();
  reports.push({ path, generatedAt: new Date().toISOString(), report });
  localStorage.setItem(reportsKey, JSON.stringify(reports));
  scheduleAnonymousSync();
}

export function hasRatedReportSince(path: string, timestamp: string): boolean {
  if (!outline.some((session) => session.path === path)) {
    throw new Error('The current session is not in the outline.');
  }
  const sessionStart = Date.parse(timestamp);
  if (!Number.isFinite(sessionStart)) throw new Error('Invalid session timestamp.');
  return readReports().some(
    (entry) =>
      entry.path === path &&
      entry.report.rank !== null &&
      entry.report.lastTimestamp !== null &&
      Date.parse(entry.report.lastTimestamp) >= sessionStart &&
      Date.parse(entry.generatedAt) >= sessionStart,
  );
}

export function priorSessionReport(path: string): SessionReportEntry | undefined {
  const index = outline.findIndex((session) => session.path === path);
  if (index < 0) throw new Error('The current session is not in the outline.');
  const reports = readReports();
  const previous = index > 0 ? outline[index - 1].path : undefined;
  const previousReports = reports.filter((entry) => entry.path === previous);
  if (previousReports.length) {
    return previousReports.reduce((latest, entry) =>
      Date.parse(entry.generatedAt) >= Date.parse(latest.generatedAt) ? entry : latest,
    );
  }
  const latestBySession = new Map<string, SessionReportEntry>();
  for (const entry of reports) {
    if (entry.path === path) continue;
    const latest = latestBySession.get(entry.path);
    if (!latest || Date.parse(entry.generatedAt) >= Date.parse(latest.generatedAt)) {
      latestBySession.set(entry.path, entry);
    }
  }
  return [...latestBySession.values()].reduce<SessionReportEntry | undefined>((latest, entry) => {
    if (!latest) return entry;
    const timestamp = Date.parse(entry.report.lastTimestamp ?? entry.generatedAt);
    const latestTimestamp = Date.parse(latest.report.lastTimestamp ?? latest.generatedAt);
    if (timestamp > latestTimestamp) return entry;
    if (
      timestamp === latestTimestamp &&
      Date.parse(entry.generatedAt) >= Date.parse(latest.generatedAt)
    ) {
      return entry;
    }
    return latest;
  }, undefined);
}

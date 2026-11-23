import type { BaseSession } from './base';

export interface SessionTiming {
  sessionStart: Date;
  previousSessionEnd: Date | null;
}

export type BabyStep = BaseSession;

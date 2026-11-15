export interface SessionTiming {
  sessionStart: Date;
  previousSessionEnd: Date | null;
}

export interface BabyStep {
  step: string;
  phase: string;
  tagline: string;
  name: string;
  description: string;
  path: string;
  intro: string;
  prompt: string;
  condition: (timing: SessionTiming) => boolean;
}

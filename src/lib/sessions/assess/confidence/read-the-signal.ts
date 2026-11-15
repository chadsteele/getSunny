import { startsAtLeast18HoursAfterPreviousSession } from '../../condition';
import type { BabyStep } from '../../types';

export default {
  step: 'Assess',
  phase: 'Confidence',
  tagline: 'Rewire the signals and systems.',
  name: 'Read the Signal',
  description: 'You can recognize the loop firing before the purchase—the moment before the spend.',
  path: '/Assess/Confidence/Read-the-Signal',
  intro:
    "This session is called Read the Signal. We'll explore how to recognize the loop that shows up before a purchase.",
  prompt:
    'Help the user notice the thoughts, feelings, and cues that arise just before an unplanned purchase. Ask one question at a time.',
  condition: startsAtLeast18HoursAfterPreviousSession,
} satisfies BabyStep;

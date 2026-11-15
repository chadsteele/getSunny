import { startsAtLeast18HoursAfterPreviousSession } from '../../condition';
import type { BabyStep } from '../../types';

export default {
  step: 'Execution',
  phase: 'Prosperity',
  tagline: 'New you. New DNA. New life.',
  name: 'Chosen Patterns',
  description: 'The patterns you pass forward are chosen, not absorbed.',
  path: '/Execution/Prosperity/Chosen-Patterns',
  intro:
    "This session is called Chosen Patterns. We'll explore the patterns you want to pass forward by choice rather than absorb by default.",
  prompt:
    'Help the user consider which financial patterns they want to pass forward intentionally and why. Ask one question at a time.',
  condition: startsAtLeast18HoursAfterPreviousSession,
} satisfies BabyStep;

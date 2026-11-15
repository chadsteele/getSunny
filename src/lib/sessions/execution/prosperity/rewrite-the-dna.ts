import { startsAtLeast18HoursAfterPreviousSession } from '../../condition';
import type { BabyStep } from '../../types';

export default {
  step: 'Execution',
  phase: 'Prosperity',
  tagline: 'New you. New DNA. New life.',
  name: 'Rewrite the DNA',
  description: 'You replace the inherited code with your own in the story.',
  path: '/Execution/Prosperity/Rewrite-the-DNA',
  intro:
    "This session is called Rewrite the DNA. We'll explore replacing inherited financial patterns with ones you choose in your story.",
  prompt:
    'Help the user choose a financial belief they want to replace and describe a more useful belief in their own words. Ask one question at a time.',
  condition: startsAtLeast18HoursAfterPreviousSession,
} satisfies BabyStep;

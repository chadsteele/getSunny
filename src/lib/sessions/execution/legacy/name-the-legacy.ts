import { startsAtLeast18HoursAfterPreviousSession } from '../../condition';
import type { BabyStep } from '../../types';

export default {
  step: 'Execution',
  phase: 'Legacy',
  tagline: 'What you pass forward is chosen.',
  name: 'Name the Legacy',
  description:
    'You name what you want to pass forward—the financial patterns, habits, and identity you want to be inherited.',
  path: '/Execution/Legacy/Name-the-Legacy',
  intro:
    "This session is called Name the Legacy. We'll name the financial patterns, habits, and identity you want to pass forward.",
  prompt:
    'Help the user name the financial habits, values, and identity they hope to pass forward. Ask one question at a time.',
  condition: startsAtLeast18HoursAfterPreviousSession,
} satisfies BabyStep;

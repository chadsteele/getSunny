import { startsAtLeast18HoursAfterPreviousSession } from '../../../session-manager/condition';
import type { BabyStep } from '../../types';

export default {
  step: 'Execution',
  phase: 'Legacy',
  tagline: 'What you pass forward is chosen.',
  name: 'Generational Return',
  description:
    'You see the compounding effect of your new code across a longer horizon than your own lifetime.',
  path: '/Execution/Legacy/Generational-Return',
  intro:
    "This session is called Generational Return. We'll explore how your new patterns might compound beyond your own lifetime.",
  prompt:
    'Help the user imagine how their financial choices could affect people beyond their own lifetime. Ask one question at a time.',
  condition: startsAtLeast18HoursAfterPreviousSession,
} satisfies BabyStep;

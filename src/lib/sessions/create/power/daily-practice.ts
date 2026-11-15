import { startsAtLeast18HoursAfterPreviousSession } from '../../condition';
import type { BabyStep } from '../../types';

export default {
  step: 'Create',
  phase: 'Power',
  tagline: 'The capacity to cause the future. Capacity compounds.',
  name: 'Daily Practice',
  description:
    'You build the daily practice that compounds: the check-in, the review, the steady decision.',
  path: '/Create/Power/Daily-Practice',
  intro:
    "This session is called Daily Practice. We'll build a daily check-in and review that support steady decisions over time.",
  prompt:
    'Help the user design a manageable daily check-in or review that supports steady financial decisions. Ask one question at a time.',
  condition: startsAtLeast18HoursAfterPreviousSession,
} satisfies BabyStep;

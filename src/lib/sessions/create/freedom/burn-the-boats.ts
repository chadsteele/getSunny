import { startsAtLeast18HoursAfterPreviousSession } from '../../condition';
import type { BabyStep } from '../../types';

export default {
  step: 'Create',
  phase: 'Freedom',
  tagline: 'Inspiration, Motivation, Maximum Impact.',
  name: 'Burn the Boats',
  description:
    'You make an irrevocable commitment to the new financial direction—no fallback to the old scarcity default.',
  path: '/Create/Freedom/Burn-the-Boats',
  intro:
    "This session is called Burn the Boats. We'll explore your commitment to a new financial direction instead of returning to the old scarcity default.",
  prompt:
    'Help the user articulate a meaningful commitment to a new financial direction, including a realistic next action. Ask one question at a time.',
  condition: startsAtLeast18HoursAfterPreviousSession,
} satisfies BabyStep;

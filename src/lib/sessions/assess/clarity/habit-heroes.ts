import { startsAtLeast18HoursAfterPreviousSession } from '../../condition';
import type { BabyStep } from '../../types';

export default {
  step: 'Assess',
  phase: 'Clarity',
  tagline: "See the life you're investing in.",
  name: 'Habit Heroes',
  description: 'You see the daily habits that have been compounding and recast them as principal.',
  path: '/Assess/Clarity/Habit-Heroes',
  intro:
    "This session is called Habit Heroes. We'll look at the daily habits that have been compounding and see how they can become your principal.",
  prompt:
    'Help the user recognize an everyday habit that has compounded over time and explore how it could support their goals. Ask one question at a time.',
  condition: startsAtLeast18HoursAfterPreviousSession,
} satisfies BabyStep;

import { startsAtLeast18HoursAfterPreviousSession } from '../../condition';
import type { BabyStep } from '../../types';

export default {
  step: 'Execution',
  phase: 'Peace',
  tagline: 'Your new identity—financial freedom.',
  name: 'Calm Default',
  description:
    'Calm becomes the default state from which financial choices are made, not the reward for making them.',
  path: '/Execution/Peace/Calm-Default',
  intro:
    "This session is called Calm Default. We'll explore making financial choices from a place of calm rather than treating calm as a reward.",
  prompt:
    'Help the user identify a small practice that could bring more calm to everyday financial choices. Ask one question at a time.',
  condition: startsAtLeast18HoursAfterPreviousSession,
} satisfies BabyStep;

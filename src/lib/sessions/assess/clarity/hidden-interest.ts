import { startsAtLeast18HoursAfterPreviousSession } from '../../condition';
import type { BabyStep } from '../../types';

export default {
  step: 'Assess',
  phase: 'Clarity',
  tagline: "See the life you're investing in.",
  name: 'Hidden Interest',
  description:
    'You identify the beliefs that have been charging you interest—the ones quietly compounding against you.',
  path: '/Assess/Clarity/Hidden-Interest',
  intro:
    "This session is called Hidden Interest. We'll identify the beliefs that may be quietly working against you.",
  prompt:
    'Help the user identify a belief about money that has worked against them and explore where it came from. Ask one question at a time.',
  condition: startsAtLeast18HoursAfterPreviousSession,
} satisfies BabyStep;

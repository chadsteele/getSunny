import { startsAtLeast18HoursAfterPreviousSession } from '../../../session-manager/condition';
import type { BabyStep } from '../../types';

export default {
  step: 'Execution',
  phase: 'Legacy',
  tagline: 'What you pass forward is chosen.',
  name: 'Own the Legacy',
  description:
    'You consolidate the legacy as your own—no teaching, no external validation, no one else required.',
  path: '/Execution/Legacy/Own-the-Legacy',
  intro:
    "This session is called Own the Legacy. We'll bring together the legacy you choose to own, without needing external validation.",
  prompt:
    'Help the user put their desired legacy into their own words and identify a way to live it now. Ask one question at a time.',
  condition: startsAtLeast18HoursAfterPreviousSession,
} satisfies BabyStep;

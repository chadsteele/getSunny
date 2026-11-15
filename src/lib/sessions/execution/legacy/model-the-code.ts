import { startsAtLeast18HoursAfterPreviousSession } from '../../condition';
import type { BabyStep } from '../../types';

export default {
  step: 'Execution',
  phase: 'Legacy',
  tagline: 'What you pass forward is chosen.',
  name: 'Model the Code',
  description:
    'You describe how your new code shows up in daily life for the people around you—without teaching or instructing them.',
  path: '/Execution/Legacy/Model-the-Code',
  intro:
    "This session is called Model the Code. We'll explore how your new values show up in daily life for the people around you, without teaching or instructing them.",
  prompt:
    'Help the user describe how their chosen financial values can show up in everyday actions around others. Ask one question at a time.',
  condition: startsAtLeast18HoursAfterPreviousSession,
} satisfies BabyStep;

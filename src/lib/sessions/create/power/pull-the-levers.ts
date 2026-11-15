import { startsAtLeast18HoursAfterPreviousSession } from '../../condition';
import type { BabyStep } from '../../types';

export default {
  step: 'Create',
  phase: 'Power',
  tagline: 'The capacity to cause the future. Capacity compounds.',
  name: 'Pull the Levers',
  description:
    'You pull them deliberately in the story, and the curve steepens because you chose it to.',
  path: '/Create/Power/Pull-the-Levers',
  intro:
    "This session is called Pull the Levers. We'll explore how deliberate choices in your story can strengthen your trajectory.",
  prompt:
    'Help the user select one financial lever and describe a deliberate action they can take to influence it. Ask one question at a time.',
  condition: startsAtLeast18HoursAfterPreviousSession,
} satisfies BabyStep;

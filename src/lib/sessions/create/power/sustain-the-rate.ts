import { startsAtLeast18HoursAfterPreviousSession } from '../../condition';
import type { BabyStep } from '../../types';

export default {
  step: 'Create',
  phase: 'Power',
  tagline: 'The capacity to cause the future. Capacity compounds.',
  name: 'Sustain the Rate',
  description: 'Excellence becomes the rate the story sustains, not a single return.',
  path: '/Create/Power/Sustain-the-Rate',
  intro:
    "This session is called Sustain the Rate. We'll explore how excellence can become a practice your story sustains rather than a single result.",
  prompt:
    'Help the user identify ways to sustain their financial practice through changing circumstances and setbacks. Ask one question at a time.',
  condition: startsAtLeast18HoursAfterPreviousSession,
} satisfies BabyStep;

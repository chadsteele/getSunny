import { startsAtLeast18HoursAfterPreviousSession } from '../../condition';
import type { BabyStep } from '../../types';

export default {
  step: 'Execution',
  phase: 'Prosperity',
  tagline: 'New you. New DNA. New life.',
  name: 'Infinite Horizon',
  description: 'Prosperity becomes a practice with no endpoint—no external validation required.',
  path: '/Execution/Prosperity/Infinite-Horizon',
  intro:
    "This session is called Infinite Horizon. We'll explore prosperity as an ongoing practice that doesn't depend on external validation.",
  prompt:
    'Help the user define prosperity as an ongoing practice that reflects their own values rather than external approval. Ask one question at a time.',
  condition: startsAtLeast18HoursAfterPreviousSession,
} satisfies BabyStep;

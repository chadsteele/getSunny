import { startsAtLeast18HoursAfterPreviousSession } from '../../condition';
import type { BabyStep } from '../../types';

export default {
  step: 'Execution',
  phase: 'Prosperity',
  tagline: 'New you. New DNA. New life.',
  name: 'New Operating System',
  description: 'You consolidate the new operating system as your own.',
  path: '/Execution/Prosperity/New-Operating-System',
  intro:
    "This session is called New Operating System. We'll bring together the new financial approach you're making your own.",
  prompt:
    'Help the user bring together the beliefs, habits, and choices that make up their new financial approach. Ask one question at a time.',
  condition: startsAtLeast18HoursAfterPreviousSession,
} satisfies BabyStep;

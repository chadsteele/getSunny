import { startsAtLeast18HoursAfterPreviousSession } from '../../condition';
import type { BabyStep } from '../../types';

export default {
  step: 'Create',
  phase: 'Freedom',
  tagline: 'Inspiration, Motivation, Maximum Impact.',
  name: 'No Return Path',
  description:
    'The story ends the return path; the cost of going back is higher than the cost of continuing.',
  path: '/Create/Freedom/No-Return-Path',
  intro:
    "This session is called No Return Path. We'll explore how your story changes when continuing forward matters more than going back.",
  prompt:
    'Help the user explore why they want to continue their new direction and how they will handle the pull of old habits. Ask one question at a time.',
  condition: startsAtLeast18HoursAfterPreviousSession,
} satisfies BabyStep;

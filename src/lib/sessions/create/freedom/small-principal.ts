import { startsAtLeast18HoursAfterPreviousSession } from '../../../session-manager/condition';
import type { BabyStep } from '../../types';

export default {
  step: 'Create',
  phase: 'Freedom',
  tagline: 'Inspiration, Motivation, Maximum Impact.',
  name: 'Small Principal',
  description: 'You see that a small principal with a long horizon produces real momentum.',
  path: '/Create/Freedom/Small-Principal',
  intro:
    "This session is called Small Principal. We'll explore how a small starting amount and a long horizon can create momentum.",
  prompt:
    'Help the user explore how a modest, sustainable contribution can build momentum over time. Ask one question at a time.',
  condition: startsAtLeast18HoursAfterPreviousSession,
} satisfies BabyStep;

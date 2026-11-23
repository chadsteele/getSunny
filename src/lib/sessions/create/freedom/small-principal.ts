import base from './base';
import type { BabyStep } from '../../types';

export default {
  ...base,
  name: 'Small Principal',
  description: 'You see that a small principal with a long horizon produces real momentum.',
  path: '/Create/Freedom/Small-Principal',
  intro:
    "This session is called Small Principal. We'll explore how a small starting amount and a long horizon can create momentum.",
  prompt:
    'Help the user explore how a modest, sustainable contribution can build momentum over time.',
} satisfies BabyStep;

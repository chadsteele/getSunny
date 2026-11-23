import base from './base';
import type { BabyStep } from '../../types';

export default {
  ...base,
  name: 'Daily Practice',
  description:
    'You build the daily practice that compounds: the check-in, the review, the steady decision.',
  path: '/Create/Power/Daily-Practice',
  intro:
    "This session is called Daily Practice. We'll build a daily check-in and review that support steady decisions over time.",
  prompt:
    'Help the user design a manageable daily check-in or review that supports steady financial decisions.',
} satisfies BabyStep;

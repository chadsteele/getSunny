import base from './base';
import type { BabyStep } from '../../types';

export default {
  ...base,
  name: 'Name the Legacy',
  description:
    'You name what you want to pass forward—the financial patterns, habits, and identity you want to be inherited.',
  path: '/Execution/Legacy/Name-the-Legacy',
  intro:
    "This session is called Name the Legacy. We'll name the financial patterns, habits, and identity you want to pass forward.",
  prompt:
    'Help the user name the financial habits, values, and identity they hope to pass forward.',
} satisfies BabyStep;

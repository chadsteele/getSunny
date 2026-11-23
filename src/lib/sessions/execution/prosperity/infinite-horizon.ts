import base from './base';
import type { BabyStep } from '../../types';

export default {
  ...base,
  name: 'Infinite Horizon',
  description: 'Prosperity becomes a practice with no endpoint—no external validation required.',
  path: '/Execution/Prosperity/Infinite-Horizon',
  intro:
    "This session is called Infinite Horizon. We'll explore prosperity as an ongoing practice that doesn't depend on external validation.",
  prompt:
    'Help the user define prosperity as an ongoing practice that reflects their own values rather than external approval.',
} satisfies BabyStep;

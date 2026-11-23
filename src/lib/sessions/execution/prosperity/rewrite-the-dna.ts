import base from './base';
import type { BabyStep } from '../../types';

export default {
  ...base,
  name: 'Rewrite the DNA',
  description: 'You replace the inherited code with your own in the story.',
  path: '/Execution/Prosperity/Rewrite-the-DNA',
  intro:
    "This session is called Rewrite the DNA. We'll explore replacing inherited financial patterns with ones you choose in your story.",
  prompt:
    'Help the user choose a financial belief they want to replace and describe a more useful belief in their own words.',
} satisfies BabyStep;

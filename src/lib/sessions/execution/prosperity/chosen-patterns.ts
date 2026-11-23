import base from './base';
import type { BabyStep } from '../../types';

export default {
  ...base,
  name: 'Chosen Patterns',
  description: 'The patterns you pass forward are chosen, not absorbed.',
  path: '/Execution/Prosperity/Chosen-Patterns',
  intro:
    "This session is called Chosen Patterns. We'll explore the patterns you want to pass forward by choice rather than absorb by default.",
  prompt:
    'Help the user consider which financial patterns they want to pass forward intentionally and why.',
} satisfies BabyStep;

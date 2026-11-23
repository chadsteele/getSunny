import base from './base';
import type { BabyStep } from '../../types';

export default {
  ...base,
  name: 'Break the Chain',
  description:
    'You identify any inherited pattern you do not want to pass on and see it end in the story.',
  path: '/Execution/Legacy/Break-the-Chain',
  intro:
    "This session is called Break the Chain. We'll identify an inherited pattern you don't want to pass on and explore ending it in your story.",
  prompt:
    'Help the user identify an inherited financial pattern they want to interrupt and describe an alternative.',
} satisfies BabyStep;

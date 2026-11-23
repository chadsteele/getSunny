import base from './base';
import type { BabyStep } from '../../types';

export default {
  ...base,
  name: 'Real Returns',
  description:
    'You put a number and a direction on the vague "someday" and see what the return actually looks like.',
  path: '/Assess/Clarity/Real-Returns',
  intro:
    "This session is called Real Returns. We'll put a number and a direction on your someday goal so you can see what the return looks like.",
  prompt:
    'Help the user turn a someday goal into a concrete target with a number, a timeframe, and a description of what success looks like.',
} satisfies BabyStep;

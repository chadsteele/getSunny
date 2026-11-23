import base from './base';
import type { BabyStep } from '../../types';

export default {
  ...base,
  name: 'Hidden Interest',
  description:
    'You identify the beliefs that have been charging you interest—the ones quietly compounding against you.',
  path: '/Assess/Clarity/Hidden-Interest',
  intro:
    "This session is called Hidden Interest. We'll identify the beliefs that may be quietly working against you.",
  prompt:
    'Help the user identify a belief about money that has worked against them and explore where it came from.',
} satisfies BabyStep;

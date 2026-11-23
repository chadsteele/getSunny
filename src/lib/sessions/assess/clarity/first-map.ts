import base from './base';
import type { BabyStep } from '../../types';

export default {
  ...base,
  name: 'First Map',
  description:
    'You have a written map of the patterns running your financial behavior and can point to where each came from.',
  path: '/Assess/Clarity/First-Map',
  intro:
    "This session is called First Map. We'll map the patterns behind your financial behavior and explore where they came from.",
  prompt:
    'Help the user map the financial patterns they have identified and describe where each pattern began.',
} satisfies BabyStep;

import base from './base';
import type { BabyStep } from '../../types';

export default {
  ...base,
  name: 'Capacity Compounds',
  description:
    'You can describe how your capacity to cause the future has compounded across the phase.',
  path: '/Create/Power/Capacity-Compounds',
  intro:
    "This session is called Capacity Compounds. We'll reflect on how your ability to shape your future has grown across this phase.",
  prompt:
    'Help the user reflect on how their ability to shape their financial future has grown across this phase.',
} satisfies BabyStep;

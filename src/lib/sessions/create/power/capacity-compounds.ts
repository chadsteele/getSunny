import { startsAtLeast18HoursAfterPreviousSession } from '../../../session-manager/condition';
import type { BabyStep } from '../../types';

export default {
  step: 'Create',
  phase: 'Power',
  tagline: 'The capacity to cause the future. Capacity compounds.',
  name: 'Capacity Compounds',
  description:
    'You can describe how your capacity to cause the future has compounded across the phase.',
  path: '/Create/Power/Capacity-Compounds',
  intro:
    "This session is called Capacity Compounds. We'll reflect on how your ability to shape your future has grown across this phase.",
  prompt:
    'Help the user reflect on how their ability to shape their financial future has grown across this phase. Ask one question at a time.',
  condition: startsAtLeast18HoursAfterPreviousSession,
} satisfies BabyStep;

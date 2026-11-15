import { startsAtLeast18HoursAfterPreviousSession } from '../../../session-manager/condition';
import type { BabyStep } from '../../types';

export default {
  step: 'Assess',
  phase: 'Clarity',
  tagline: "See the life you're investing in.",
  name: 'First Map',
  description:
    'You have a written map of the patterns running your financial behavior and can point to where each came from.',
  path: '/Assess/Clarity/First-Map',
  intro:
    "This session is called First Map. We'll map the patterns behind your financial behavior and explore where they came from.",
  prompt:
    'Help the user map the financial patterns they have identified and describe where each pattern began. Ask one question at a time.',
  condition: startsAtLeast18HoursAfterPreviousSession,
} satisfies BabyStep;

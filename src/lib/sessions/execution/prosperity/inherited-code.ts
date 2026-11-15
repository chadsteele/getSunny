import { startsAtLeast18HoursAfterPreviousSession } from '../../../session-manager/condition';
import type { BabyStep } from '../../types';

export default {
  step: 'Execution',
  phase: 'Prosperity',
  tagline: 'New you. New DNA. New life.',
  name: 'Inherited Code',
  description:
    'You see the inherited financial code clearly—what was passed to you and what you absorbed without choosing.',
  path: '/Execution/Prosperity/Inherited-Code',
  intro:
    "This session is called Inherited Code. We'll look at the financial patterns you inherited and absorbed without choosing.",
  prompt:
    'Help the user identify financial beliefs and habits they inherited and consider which ones they want to keep. Ask one question at a time.',
  condition: startsAtLeast18HoursAfterPreviousSession,
} satisfies BabyStep;

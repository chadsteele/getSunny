import { startsAtLeast18HoursAfterPreviousSession } from '../../../session-manager/condition';
import type { BabyStep } from '../../types';

export default {
  step: 'Execution',
  phase: 'Peace',
  tagline: 'Your new identity—financial freedom.',
  name: 'Quiet Capital',
  description: 'You experience money decisions without the low-grade alarm underneath them.',
  path: '/Execution/Peace/Quiet-Capital',
  intro:
    "This session is called Quiet Capital. We'll explore what it feels like to make money decisions without an underlying alarm.",
  prompt:
    'Help the user imagine making a financial decision without the familiar sense of alarm and describe what feels different. Ask one question at a time.',
  condition: startsAtLeast18HoursAfterPreviousSession,
} satisfies BabyStep;

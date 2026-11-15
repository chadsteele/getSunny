import { startsAtLeast18HoursAfterPreviousSession } from '../../condition';
import type { BabyStep } from '../../types';

export default {
  step: 'Execution',
  phase: 'Peace',
  tagline: 'Your new identity—financial freedom.',
  name: 'I AM',
  description:
    'You state your financial identity from sufficiency, not scarcity—who you are with money, independent of the balance.',
  path: '/Execution/Peace/I-AM',
  intro:
    "This session is called I AM. We'll explore your financial identity from a place of sufficiency, independent of your balance.",
  prompt:
    'Help the user describe who they want to be with money, independently of their current balance. Ask one question at a time.',
  condition: startsAtLeast18HoursAfterPreviousSession,
} satisfies BabyStep;

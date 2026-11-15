import { startsAtLeast18HoursAfterPreviousSession } from '../../../session-manager/condition';
import type { BabyStep } from '../../types';

export default {
  step: 'Execution',
  phase: 'Legacy',
  tagline: 'What you pass forward is chosen.',
  name: 'Break the Chain',
  description:
    'You identify any inherited pattern you do not want to pass on and see it end in the story.',
  path: '/Execution/Legacy/Break-the-Chain',
  intro:
    "This session is called Break the Chain. We'll identify an inherited pattern you don't want to pass on and explore ending it in your story.",
  prompt:
    'Help the user identify an inherited financial pattern they want to interrupt and describe an alternative. Ask one question at a time.',
  condition: startsAtLeast18HoursAfterPreviousSession,
} satisfies BabyStep;

import { startsAtLeast18HoursAfterPreviousSession } from '../../../session-manager/condition';
import type { BabyStep } from '../../types';

export default {
  step: 'Create',
  phase: 'Freedom',
  tagline: 'Inspiration, Motivation, Maximum Impact.',
  name: 'Big Bang',
  description: 'You take the first concrete action that starts the compounding curve.',
  path: '/Create/Freedom/Big-Bang',
  intro:
    "This session is called Big Bang. We'll identify the first concrete action that starts your compounding curve.",
  prompt:
    'Help the user choose a specific, achievable first action that begins progress toward their financial goal. Ask one question at a time.',
  condition: startsAtLeast18HoursAfterPreviousSession,
} satisfies BabyStep;

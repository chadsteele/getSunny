import { startsAtLeast18HoursAfterPreviousSession } from '../../condition';
import type { BabyStep } from '../../types';

export default {
  step: 'Create',
  phase: 'Power',
  tagline: 'The capacity to cause the future. Capacity compounds.',
  name: 'Find the Levers',
  description:
    'You identify the levers that increase your rate of return—income, savings rate, attention allocation.',
  path: '/Create/Power/Find-the-Levers',
  intro:
    "This session is called Find the Levers. We'll identify ways to increase your rate of return, including income, savings, and attention.",
  prompt:
    'Help the user identify practical levers they can influence, such as income, saving, or attention, and their potential effects. Ask one question at a time.',
  condition: startsAtLeast18HoursAfterPreviousSession,
} satisfies BabyStep;

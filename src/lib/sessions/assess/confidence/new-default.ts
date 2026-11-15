import { startsAtLeast18HoursAfterPreviousSession } from '../../../session-manager/condition';
import type { BabyStep } from '../../types';

export default {
  step: 'Assess',
  phase: 'Confidence',
  tagline: 'Rewire the signals and systems.',
  name: 'New Default',
  description:
    'You experience the avoidance loop losing its grip and the new code earning compounding clarity.',
  path: '/Assess/Confidence/New-Default',
  intro:
    "This session is called New Default. We'll explore what changes as the avoidance loop loosens its grip and clarity grows.",
  prompt:
    'Help the user describe what greater clarity looks like when they respond differently to a familiar avoidance pattern. Ask one question at a time.',
  condition: startsAtLeast18HoursAfterPreviousSession,
} satisfies BabyStep;

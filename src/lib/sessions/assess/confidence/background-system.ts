import { startsAtLeast18HoursAfterPreviousSession } from '../../../session-manager/condition';
import type { BabyStep } from '../../types';

export default {
  step: 'Assess',
  phase: 'Confidence',
  tagline: 'Rewire the signals and systems.',
  name: 'Background System',
  description: 'You build a system into the story so willpower is not the only capital you deploy.',
  path: '/Assess/Confidence/Background-System',
  intro:
    "This session is called Background System. We'll build a system into your story so you don't have to rely on willpower alone.",
  prompt:
    'Help the user design a practical support system for a financial goal so that progress does not depend on willpower alone. Ask one question at a time.',
  condition: startsAtLeast18HoursAfterPreviousSession,
} satisfies BabyStep;

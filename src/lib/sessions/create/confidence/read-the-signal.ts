import base from './base';
import type { BabyStep } from '../../types';

export default {
  ...base,
  name: 'Read the Signal',
  description: 'You can recognize the loop firing before the purchase—the moment before the spend.',
  path: '/Assess/Confidence/Read-the-Signal',
  intro:
    "This session is called Read the Signal. We'll explore how to recognize the loop that shows up before a purchase.",
  prompt:
    'Help the user notice the thoughts, feelings, and cues that arise just before an unplanned purchase.',
} satisfies BabyStep;

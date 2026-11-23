import base from './base';
import type { BabyStep } from '../../types';

export default {
  ...base,
  name: 'Find the Levers',
  description:
    'You identify the levers that increase your rate of return—income, savings rate, attention allocation.',
  path: '/Create/Power/Find-the-Levers',
  intro:
    "This session is called Find the Levers. We'll identify ways to increase your rate of return, including income, savings, and attention.",
  prompt:
    'Help the user identify practical levers they can influence, such as income, saving, or attention, and their potential effects.',
} satisfies BabyStep;

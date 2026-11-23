import base from './base';
import type { BabyStep } from '../../types';

export default {
  ...base,
  name: 'Big Bang',
  description: 'You take the first concrete action that starts the compounding curve.',
  path: '/Create/Freedom/Big-Bang',
  intro:
    "This session is called Big Bang. We'll identify the first concrete action that starts your compounding curve.",
  prompt:
    'Help the user choose a specific, achievable first action that begins progress toward their financial goal.',
} satisfies BabyStep;

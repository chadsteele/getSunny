import base from './base';
import type { BabyStep } from '../../types';

export default {
  ...base,
  name: 'Reboot',
  description: 'You interrupt the old code and install the new neural code in the story.',
  path: '/Assess/Confidence/Reboot',
  intro:
    "This session is called Reboot. We'll explore interrupting the old code and creating a new response in your story.",
  prompt:
    'Help the user imagine interrupting an old financial pattern and choosing a different response in a specific situation.',
} satisfies BabyStep;

import base from './base';
import type { BabyStep } from '../../types';

export default {
  ...base,
  name: 'Pull the Levers',
  description:
    'You pull them deliberately in the story, and the curve steepens because you chose it to.',
  path: '/Create/Power/Pull-the-Levers',
  intro:
    "This session is called Pull the Levers. We'll explore how deliberate choices in your story can strengthen your trajectory.",
  prompt:
    'Help the user select one financial lever and describe a deliberate action they can take to influence it.',
} satisfies BabyStep;

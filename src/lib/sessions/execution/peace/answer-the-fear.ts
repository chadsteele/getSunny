import base from './base';
import type { BabyStep } from '../../types';

export default {
  ...base,
  name: 'Answer the Fear',
  description: 'The story answers the fear of dependence with identity, not numbers.',
  path: '/Execution/Peace/Answer-the-Fear',
  intro:
    "This session is called Answer the Fear. We'll explore how your story can answer the fear of dependence through identity rather than numbers.",
  prompt:
    'Help the user explore a fear of financial dependence and identify a response grounded in their values and capabilities.',
} satisfies BabyStep;

import base from './base';
import type { BabyStep } from '../../types';

export default {
  ...base,
  name: 'New Trajectory',
  description: 'The story begins the new trajectory, and you can describe where it is heading.',
  path: '/Create/Freedom/New-Trajectory',
  intro:
    "This session is called New Trajectory. We'll explore the new direction beginning in your story and where it is heading.",
  prompt:
    'Help the user describe the direction their recent choices are creating and where they hope it leads.',
} satisfies BabyStep;

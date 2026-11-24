import base from './base';
import type { BabyStep } from '../../types';

export default {
  ...base,
  name: 'New Identity',
  description:
    'You can describe your new financial identity in your own words and hold it under pressure.',
  path: '/Execution/Peace/New-Identity',
  intro:
    "This session is called New Identity. We'll describe your financial identity in your own words and explore how it holds up under pressure.",
  prompt:
    'Help the user describe their developing financial identity in their own words and consider how it holds up under pressure.',
} satisfies BabyStep;

import base from './base';
import type { BabyStep } from '../../types';

export default {
  ...base,
  name: 'First Map',
  description:
    'You have a written map of the patterns running your financial behavior and can point to where each came from.',
  path: '/Assess/Clarity/First-Map',
  intro:
    `Welcome back <name>, 
    This session is called First Map. We'll map the patterns behind your financial behavior and explore where they came from.`,
  prompt:
   base.prompt + ``,
    
      objectives:
        base.objectives +
        `
    Imagine your heros.  What do you admire about them?  Are they wealthy?  Poor?
    Now imagine your least favorite celebrity billionaire.  What don't you like about them?
    What financial patterns do you like most about yourself?  Who influenced each pattern and how did it develop?
    What are the financial patterns you like the least about yourself?  Who influenced each pattern and how did it develop?
    List 5 limiting beliefs you have about you and money.

    `,
    
      process:
        base.process +
        `
        Try to fulfill the objectives as succinctly as possible.  Tonight is not a deep dive, just a quick assessment and reflection on your financial patterns.
    
    
        `,
} satisfies BabyStep;

import type { WorkflowDefinition } from '../types';
import { conciergeWorkflow } from './concierge';
import { immediateWorkflow } from './immediate';
import { laundryWorkflow, logisticsWorkflow } from './logistics';
import { quoteWorkflow } from './quote';
import { scheduledWorkflow } from './scheduled';

export const builtinDefinitions: WorkflowDefinition[] = [
  immediateWorkflow,
  scheduledWorkflow,
  quoteWorkflow,
  logisticsWorkflow,
  laundryWorkflow,
  conciergeWorkflow,
];

export {
  conciergeWorkflow,
  immediateWorkflow,
  laundryWorkflow,
  logisticsWorkflow,
  quoteWorkflow,
  scheduledWorkflow,
};

/**
 * Dependency injection for the Slack adapter (see @eclaire/channels-core).
 */

import { createDepsHolder } from "@eclaire/channels-core";

export const { setDeps, getDeps } = createDepsHolder("Slack");

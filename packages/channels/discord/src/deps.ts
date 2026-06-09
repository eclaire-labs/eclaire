/**
 * Dependency injection for the Discord adapter (see @eclaire/channels-core).
 */

import { createDepsHolder } from "@eclaire/channels-core";

export const { setDeps, getDeps } = createDepsHolder("Discord");

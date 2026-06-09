/**
 * Dependency injection for the Telegram adapter (see @eclaire/channels-core).
 */

import { createDepsHolder } from "@eclaire/channels-core";

export const { setDeps, getDeps } = createDepsHolder("Telegram");

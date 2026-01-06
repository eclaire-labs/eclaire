import { getAllProviders } from "../../config/providers.js";
import type { CommandOptions } from "../../types/index.js";
import { colors, icons } from "../../ui/colors.js";
import { createProvidersTable } from "../../ui/tables.js";

export async function listCommand(options: CommandOptions): Promise<void> {
  try {
    console.log(colors.header(`${icons.plug} Configured AI Providers\n`));

    const providers = getAllProviders();
    const providerIds = Object.keys(providers);

    if (providerIds.length === 0) {
      console.log(colors.warning(`${icons.warning} No providers configured`));
      console.log(colors.dim('\nRun "eclaire provider add" to add a provider'));
      return;
    }

    // Output format
    if (options.json) {
      console.log(JSON.stringify({ providers }, null, 2));
      return;
    }

    // Show summary
    console.log(colors.dim(`Found ${providerIds.length} provider(s)\n`));

    // Show table
    console.log(createProvidersTable(providers));

    // Show helpful commands
    console.log(colors.dim("\nCommands:"));
    console.log(
      colors.dim("  eclaire provider add          - Add a new provider"),
    );
    console.log(
      colors.dim("  eclaire provider edit <id>    - Edit a provider"),
    );
    console.log(
      colors.dim(
        "  eclaire provider test <id>    - Test provider connectivity",
      ),
    );
    console.log(
      colors.dim("  eclaire provider remove <id>  - Remove a provider"),
    );
  } catch (error: any) {
    console.log(
      colors.error(`${icons.error} Failed to list providers: ${error.message}`),
    );
    process.exit(1);
  }
}

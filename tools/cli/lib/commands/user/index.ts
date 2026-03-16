/**
 * User subcommand registration
 */

import { Command } from "commander";
import { listCommand } from "./list.js";
import { promoteCommand } from "./promote.js";
import { demoteCommand } from "./demote.js";

export function registerUserCommands(program: Command): void {
  const user = new Command("user")
    .description("Manage users and admin roles")
    .action(() => {
      user.help();
    });

  user
    .command("list")
    .alias("ls")
    .description("List all users")
    .option("--json", "Output as JSON")
    .action(listCommand);

  user
    .command("promote")
    .description("Promote a user to instance admin")
    .argument("<email>", "User email")
    .action(promoteCommand);

  user
    .command("demote")
    .description("Demote a user from instance admin")
    .argument("<email>", "User email")
    .action(demoteCommand);

  program.addCommand(user);
}

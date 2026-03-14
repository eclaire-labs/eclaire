import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAISkillSources } from "../../lib/ai-init.js";

describe("resolveAISkillSources", () => {
  it("includes local user skill directories when running locally", () => {
    const userHomeDir = "/Users/tester";
    const sources = resolveAISkillSources({
      runtime: "local",
      configDir: "/app/config",
      adminSkillsDir: "/shared/admin-skills",
      userSkillsDirs: ["/extra/skills", "/team/skills"],
      userHomeDir,
      pathExists: (filePath) =>
        filePath === path.join(userHomeDir, ".agents", "skills"),
    });

    expect(sources).toEqual([
      { dir: "/app/config/ai/skills", scope: "admin" },
      { dir: "/shared/admin-skills", scope: "admin" },
      { dir: "/Users/tester/.agents/skills", scope: "user" },
      { dir: "/extra/skills", scope: "user" },
      { dir: "/team/skills", scope: "user" },
    ]);
  });

  it("does not include user skill directories outside local runtime", () => {
    const sources = resolveAISkillSources({
      runtime: "container",
      configDir: "/app/config",
      adminSkillsDir: "/shared/admin-skills",
      userSkillsDirs: ["/extra/skills"],
      userHomeDir: "/Users/tester",
      pathExists: () => true,
    });

    expect(sources).toEqual([
      { dir: "/app/config/ai/skills", scope: "admin" },
      { dir: "/shared/admin-skills", scope: "admin" },
    ]);
  });
});

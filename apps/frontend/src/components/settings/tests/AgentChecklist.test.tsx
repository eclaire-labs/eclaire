// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgentChecklist } from "@/components/settings/AssistantSettings";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));
vi.mock("@/providers/AssistantPreferencesProvider", () => ({
  useAssistantPreferences: () => [
    {
      showThinkingTokens: true,
      showAssistantOverlay: true,
    },
    vi.fn(),
    true,
  ],
}));

describe("AgentChecklist", () => {
  it("shows browseChrome availability details and disables selection", () => {
    render(
      <AgentChecklist
        title="Tools"
        description="Capabilities"
        items={[
          {
            name: "browseChrome",
            label: "Browse Chrome",
            description: "Use the user's live Chrome session.",
            availability: "setup_required",
            availabilityReason:
              "Install the chrome-devtools-mcp binary to enable this tool.",
          },
        ]}
        selectedNames={[]}
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByText("Local only")).toBeInTheDocument();
    expect(screen.getByText("Signed-in Chrome")).toBeInTheDocument();
    expect(screen.getByText("Setup required")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Install the chrome-devtools-mcp binary to enable this tool.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });
});

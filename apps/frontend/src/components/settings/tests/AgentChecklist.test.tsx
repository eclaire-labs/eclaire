// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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

  it("filters items by search query when more than 5 items", () => {
    const items = Array.from({ length: 6 }, (_, i) => ({
      name: `tool${i + 1}`,
      label: `Tool ${i + 1}`,
      description: `Description for tool ${i + 1}`,
    }));
    items[2] = {
      name: "special",
      label: "Special Tool",
      description: "Unique capability",
    };

    render(
      <AgentChecklist
        title="Tools"
        description="Capabilities"
        items={items}
        selectedNames={[]}
        onToggle={vi.fn()}
      />,
    );

    const searchInput = screen.getByPlaceholderText("Search tools...");
    expect(searchInput).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "Special" } });
    expect(screen.getByText("Special Tool")).toBeInTheDocument();
    expect(screen.queryByText("Tool 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Tool 2")).not.toBeInTheDocument();
  });
});

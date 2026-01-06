import type { ReactNode } from "react";
import { type MobileTab, MobileTabBar } from "./mobile-tab-bar";

interface MobileLayoutProps {
  children: ReactNode;
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  onChatToggle: () => void;
  onFoldersToggle: () => void;
}

export function MobileLayout({
  children,
  activeTab,
  onTabChange,
  onChatToggle,
  onFoldersToggle,
}: MobileLayoutProps) {
  return (
    <div className="flex flex-col mobile-viewport safe-area-pt">
      {/* Main Content - Full height minus only the tab bar */}
      <div className="flex-1 overflow-y-auto pb-20">{children}</div>

      {/* Mobile Tab Bar */}
      <MobileTabBar
        activeTab={activeTab}
        onTabChange={onTabChange}
        onChatToggle={onChatToggle}
        onFoldersToggle={onFoldersToggle}
      />
    </div>
  );
}

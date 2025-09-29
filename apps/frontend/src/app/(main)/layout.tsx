import type { ReactNode } from "react";
import { MainLayoutClient } from "@/components/dashboard/main-layout-client";

export default function MainAppLayout({ children }: { children: ReactNode }) {
  return <MainLayoutClient>{children}</MainLayoutClient>;
}

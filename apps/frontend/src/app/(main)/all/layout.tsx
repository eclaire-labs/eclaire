import type { Metadata } from "next";
import type React from "react";

export const metadata: Metadata = {
  title: "All Items",
};

export default function AllLayout({ children }: { children: React.ReactNode }) {
  return children;
}

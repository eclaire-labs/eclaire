import type { Metadata } from "next";
import type React from "react";

export const metadata: Metadata = {
  title: "Pending",
};

export default function PendingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

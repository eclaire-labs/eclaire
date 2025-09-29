import type { Metadata } from "next";
import type React from "react";

export const metadata: Metadata = {
  title: "Tasks",
};

export default function TasksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

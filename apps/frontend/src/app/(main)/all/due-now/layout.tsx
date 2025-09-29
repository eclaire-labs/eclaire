import type { Metadata } from "next";
import type React from "react";

export const metadata: Metadata = {
  title: "Due Now",
};

export default function DueNowLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

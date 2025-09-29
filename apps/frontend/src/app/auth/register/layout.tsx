import type { Metadata } from "next";
import type React from "react";

export const metadata: Metadata = {
  title: "Sign Up",
};

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

"use client";

import type React from "react";

type SessionProviderProps = {
  children: React.ReactNode;
};

/**
 * Session provider using Better Auth (no provider needed for Better Auth React client)
 */
export function SessionProvider({ children }: SessionProviderProps) {
  return <>{children}</>;
}

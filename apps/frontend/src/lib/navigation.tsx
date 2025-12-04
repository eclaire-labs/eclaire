/**
 * Navigation compatibility layer
 *
 * This module provides TanStack Router equivalents for Next.js navigation APIs.
 * It allows existing components to work with minimal changes during migration.
 *
 * Usage:
 * - Replace `import { useRouter, usePathname, useParams, useSearchParams } from 'next/navigation'`
 * - With `import { useRouter, usePathname, useParams, useSearchParams } from '@/lib/navigation'`
 *
 * - Replace `import Link from 'next/link'`
 * - With `import { Link } from '@/lib/navigation'`
 */

import {
  useNavigate,
  useLocation,
  useParams as useTanStackParams,
  useSearch,
  Link as TanStackLink,
  type LinkProps as TanStackLinkProps,
} from "@tanstack/react-router";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";

/**
 * Next.js-compatible useRouter hook
 * Maps to TanStack Router's useNavigate
 */
export function useRouter() {
  const navigate = useNavigate();
  const location = useLocation();

  return {
    push: (href: string) => navigate({ to: href as any }),
    replace: (href: string) => navigate({ to: href as any, replace: true }),
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    refresh: () => window.location.reload(),
    prefetch: (_href: string) => {
      // TanStack Router handles prefetching automatically with defaultPreload: 'intent'
    },
    pathname: location.pathname,
  };
}

/**
 * Next.js-compatible usePathname hook
 */
export function usePathname(): string {
  const location = useLocation();
  return location.pathname;
}

/**
 * Next.js-compatible useParams hook
 * Returns route parameters as a Record<string, string>
 */
export function useParams<T extends Record<string, string> = Record<string, string>>(): T {
  const params = useTanStackParams({ strict: false });
  return params as T;
}

/**
 * Next.js-compatible useSearchParams hook
 * Returns a URLSearchParams-like object
 */
export function useSearchParams(): URLSearchParams {
  const location = useLocation();
  return new URLSearchParams(location.search);
}

/**
 * Next.js-compatible Link component
 * Maps to TanStack Router's Link with Next.js props API
 */
interface LinkProps extends Omit<ComponentPropsWithoutRef<"a">, "href"> {
  href: string;
  replace?: boolean;
  prefetch?: boolean;
  children?: ReactNode;
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(
  ({ href, replace, prefetch, children, ...props }, ref) => {
    return (
      <TanStackLink
        to={href as any}
        replace={replace}
        preload={prefetch === false ? false : "intent"}
        ref={ref}
        {...props}
      >
        {children}
      </TanStackLink>
    );
  },
);

Link.displayName = "Link";

// Re-export TanStack Router types for convenience
export type { TanStackLinkProps };


import { useEffect, useState } from "react";

interface ClientOnlyAuthProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Component that only renders auth-dependent content after client-side hydration
 * This prevents hydration mismatches when auth state differs between server and client
 */
export function ClientOnlyAuth({
  children,
  fallback = null,
}: ClientOnlyAuthProps) {
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

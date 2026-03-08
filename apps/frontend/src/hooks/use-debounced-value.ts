import { useEffect, useState } from "react";

/**
 * Debounces a value by the given delay in milliseconds.
 * Returns the debounced value that only updates after the delay has passed
 * without the input value changing.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

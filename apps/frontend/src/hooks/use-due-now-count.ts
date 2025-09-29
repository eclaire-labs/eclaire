import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/frontend-api";

export function useDueNowCount() {
  const [count, setCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDueNowCount = async () => {
      try {
        setIsLoading(true);
        const response = await apiFetch("/api/all?dueStatus=due_now&limit=100");
        if (response.ok) {
          const data = await response.json();
          const itemsArray = Array.isArray(data)
            ? data
            : data.items || data.entries || [];
          setCount(itemsArray.length);
        }
      } catch (error) {
        console.error("Error fetching due now count:", error);
        setCount(0);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDueNowCount();

    // Refresh count every 5 minutes
    const interval = setInterval(fetchDueNowCount, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  return { count, isLoading };
}

import { useMemo, useState } from "react";
import { useDebouncedValue } from "./use-debounced-value";

export interface CatalogSortOption<T> {
  key: string;
  label: string;
  compare: (a: T, b: T) => number;
}

export interface CatalogFilterDimension<T> {
  key: string;
  label: string;
  allLabel: string;
  extract: (item: T) => string | string[];
}

export interface UseCatalogFilterOptions<T> {
  items: T[];
  searchFields: (item: T) => string[];
  sortOptions: CatalogSortOption<T>[];
  defaultSortKey: string;
  filterDimensions?: CatalogFilterDimension<T>[];
}

export interface UseCatalogFilterResult<T> {
  filteredItems: T[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  sortKey: string;
  setSortKey: (key: string) => void;
  sortDir: "asc" | "desc";
  toggleSortDir: () => void;
  filters: Record<string, string>;
  setFilter: (key: string, val: string) => void;
  filterOptions: Record<string, string[]>;
  totalCount: number;
  filteredCount: number;
}

export function useCatalogFilter<T>(
  options: UseCatalogFilterOptions<T>,
): UseCatalogFilterResult<T> {
  const { items, searchFields, sortOptions, defaultSortKey, filterDimensions } =
    options;

  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState(defaultSortKey);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filters, setFilters] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const dim of filterDimensions ?? []) {
      init[dim.key] = "all";
    }
    return init;
  });

  const debouncedSearch = useDebouncedValue(searchQuery, 200);

  const filterOptions = useMemo(() => {
    const opts: Record<string, string[]> = {};
    for (const dim of filterDimensions ?? []) {
      const values = new Set<string>();
      for (const item of items) {
        const extracted = dim.extract(item);
        if (Array.isArray(extracted)) {
          for (const v of extracted) values.add(v);
        } else {
          values.add(extracted);
        }
      }
      opts[dim.key] = Array.from(values).sort();
    }
    return opts;
  }, [items, filterDimensions]);

  const filteredItems = useMemo(() => {
    const searchLower = debouncedSearch.toLowerCase();

    let result = items;

    // Text search
    if (searchLower) {
      result = result.filter((item) =>
        searchFields(item).some((field) =>
          field.toLowerCase().includes(searchLower),
        ),
      );
    }

    // Dimension filters
    for (const dim of filterDimensions ?? []) {
      const filterValue = filters[dim.key];
      if (filterValue && filterValue !== "all") {
        result = result.filter((item) => {
          const extracted = dim.extract(item);
          if (Array.isArray(extracted)) {
            return extracted.includes(filterValue);
          }
          return extracted === filterValue;
        });
      }
    }

    // Sort
    const sortOption = sortOptions.find((o) => o.key === sortKey);
    if (sortOption) {
      result = [...result].sort((a, b) => {
        const cmp = sortOption.compare(a, b);
        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    return result;
  }, [
    items,
    debouncedSearch,
    searchFields,
    sortOptions,
    sortKey,
    sortDir,
    filterDimensions,
    filters,
  ]);

  const setFilter = (key: string, val: string) => {
    setFilters((prev) => ({ ...prev, [key]: val }));
  };

  const toggleSortDir = () => {
    setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
  };

  return {
    filteredItems,
    searchQuery,
    setSearchQuery,
    sortKey,
    setSortKey,
    sortDir,
    toggleSortDir,
    filters,
    setFilter,
    filterOptions,
    totalCount: items.length,
    filteredCount: filteredItems.length,
  };
}

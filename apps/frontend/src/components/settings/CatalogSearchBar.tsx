import { ArrowDown, ArrowUp, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  CatalogFilterDimension,
  CatalogSortOption,
  UseCatalogFilterResult,
} from "@/hooks/use-catalog-filter";

interface CatalogSearchBarProps<T> {
  catalog: UseCatalogFilterResult<T>;
  searchPlaceholder: string;
  sortOptions: CatalogSortOption<T>[];
  filterDimensions?: CatalogFilterDimension<T>[];
}

export function CatalogSearchBar<T>({
  catalog,
  searchPlaceholder,
  sortOptions,
  filterDimensions,
}: CatalogSearchBarProps<T>) {
  return (
    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
      {/* Search */}
      <div className="relative flex-grow w-full sm:w-auto">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={searchPlaceholder}
          className={`pl-10 w-full ${catalog.searchQuery ? "pr-10" : ""}`}
          value={catalog.searchQuery}
          onChange={(e) => catalog.setSearchQuery(e.target.value)}
        />
        {catalog.searchQuery && (
          <button
            type="button"
            onClick={() => catalog.setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Filters + Sort */}
      <div className="flex flex-wrap gap-2 w-full sm:w-auto">
        {/* Filter dropdowns */}
        {filterDimensions
          ?.filter((dim) => (catalog.filterOptions[dim.key] ?? []).length > 1)
          .map((dim) => (
            <Select
              key={dim.key}
              value={catalog.filters[dim.key] ?? "all"}
              onValueChange={(val) => catalog.setFilter(dim.key, val)}
            >
              <SelectTrigger className="w-full sm:w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{dim.allLabel}</SelectItem>
                {(catalog.filterOptions[dim.key] ?? []).map((val) => (
                  <SelectItem key={val} value={val}>
                    {val}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}

        {/* Sort */}
        {sortOptions.length > 1 && (
          <Select value={catalog.sortKey} onValueChange={catalog.setSortKey}>
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((opt) => (
                <SelectItem key={opt.key} value={opt.key}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button
          variant="outline"
          size="icon"
          onClick={catalog.toggleSortDir}
          title={catalog.sortDir === "asc" ? "Ascending" : "Descending"}
        >
          {catalog.sortDir === "asc" ? (
            <ArrowUp className="h-4 w-4" />
          ) : (
            <ArrowDown className="h-4 w-4" />
          )}
        </Button>

        {/* Count */}
        <span className="flex items-center text-xs text-muted-foreground whitespace-nowrap px-2">
          {catalog.filteredCount === catalog.totalCount
            ? `${catalog.totalCount} items`
            : `${catalog.filteredCount} of ${catalog.totalCount}`}
        </span>
      </div>
    </div>
  );
}

import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp } from "lucide-react";
import React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export interface SortOptionDef {
  value: string;
  label: string;
}

export interface ViewModeDef {
  value: string;
  label: string;
  icon: LucideIcon;
}

export interface ExtraFilterDef {
  key: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}

export interface FilterSortDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityNamePlural: string;
  tagFilter: {
    value: string;
    onChange: (value: string) => void;
    options: string[];
  };
  extraFilters?: ExtraFilterDef[];
  sortBy: {
    value: string;
    onChange: (value: string) => void;
    options: SortOptionDef[];
  };
  sortDir: {
    value: "asc" | "desc";
    onToggle: () => void;
  };
  viewMode: {
    value: string;
    onChange: (value: string) => void;
    options: ViewModeDef[];
  };
  onClearAllFilters: () => void;
}

export const FilterSortDialog = React.memo(function FilterSortDialog({
  open,
  onOpenChange,
  entityNamePlural,
  tagFilter,
  extraFilters,
  sortBy,
  sortDir,
  viewMode,
  onClearAllFilters,
}: FilterSortDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Filter & Sort {entityNamePlural}</DialogTitle>
          <DialogDescription>
            Customize how you view and organize your{" "}
            {entityNamePlural.toLowerCase()}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Filters Section */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
              Filters
            </h4>

            {/* Tag Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="filter-tag">
                Tag
              </label>
              <Select
                value={tagFilter.value}
                onValueChange={tagFilter.onChange}
              >
                <SelectTrigger className="w-full" id="filter-tag">
                  <SelectValue placeholder="Filter by Tag" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tags</SelectItem>
                  {tagFilter.options.map((tag) => (
                    <SelectItem key={tag} value={tag}>
                      {tag}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Extra filters */}
            {extraFilters?.map((filter) => (
              <div key={filter.key} className="space-y-2">
                <label
                  className="text-sm font-medium"
                  htmlFor={`filter-${filter.key}`}
                >
                  {filter.label}
                </label>
                <Select value={filter.value} onValueChange={filter.onChange}>
                  <SelectTrigger className="w-full" id={`filter-${filter.key}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {filter.options.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          {/* Sort Section */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
              Sort & View
            </h4>

            {/* Sort By */}
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="sort-by">
                Sort By
              </label>
              <Select value={sortBy.value} onValueChange={sortBy.onChange}>
                <SelectTrigger className="w-full" id="sort-by">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  {sortBy.options.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sort Direction */}
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="sort-direction">
                Sort Direction
              </label>
              <Button
                variant="outline"
                onClick={sortDir.onToggle}
                className="w-full justify-start"
                id="sort-direction"
              >
                {sortDir.value === "asc" ? (
                  <>
                    <ArrowUp className="mr-2 h-4 w-4" />
                    Ascending
                  </>
                ) : (
                  <>
                    <ArrowDown className="mr-2 h-4 w-4" />
                    Descending
                  </>
                )}
              </Button>
            </div>

            {/* View Mode */}
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="view-mode">
                View Mode
              </label>
              <ToggleGroup
                type="single"
                value={viewMode.value}
                onValueChange={viewMode.onChange}
                className="w-full justify-start"
                id="view-mode"
              >
                {viewMode.options.map((opt) => (
                  <ToggleGroupItem
                    key={opt.value}
                    value={opt.value}
                    aria-label={`${opt.label} view`}
                    className="flex-1"
                  >
                    <opt.icon className="mr-2 h-4 w-4" />
                    {opt.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={onClearAllFilters}
            className="w-full sm:w-auto"
          >
            Clear All Filters
          </Button>
          <Button
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

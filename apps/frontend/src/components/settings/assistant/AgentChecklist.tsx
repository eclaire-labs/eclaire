import { Eye, Pencil, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ChecklistItem {
  name: string;
  label?: string;
  description: string;
  accessLevel?: "read" | "write";
  availability?: "available" | "setup_required" | "disabled";
  availabilityReason?: string;
}

export function AgentChecklist({
  title,
  description,
  items,
  selectedNames,
  lockedNames,
  onToggle,
  disabled,
}: {
  title: string;
  description: string;
  items: ChecklistItem[];
  selectedNames: string[];
  lockedNames?: string[];
  onToggle: (name: string, checked: boolean) => void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const filteredItems = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(
      (item) =>
        (item.label ?? item.name).toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q),
    );
  }, [items, search]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length > 5 && (
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${title.toLowerCase()}...`}
              className="pl-8 h-9"
            />
          </div>
        )}
        <div className="max-h-[calc(50vh-8rem)] overflow-y-auto pr-1">
          <div className="space-y-3">
            {filteredItems.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No {title.toLowerCase()} match your search.
              </p>
            ) : (
              filteredItems.map((item) => {
                const checked = selectedNames.includes(item.name);
                const isLocked = lockedNames?.includes(item.name) ?? false;
                const isUnavailable =
                  item.availability !== undefined &&
                  item.availability !== "available";
                const isToggleDisabled =
                  disabled || isLocked || (isUnavailable && !checked);
                return (
                  <div
                    key={item.name}
                    className="flex items-start gap-3 rounded-xl border bg-background px-3 py-3"
                  >
                    <Checkbox
                      id={`${title}-${item.name}`}
                      checked={checked}
                      onCheckedChange={(value) =>
                        onToggle(item.name, value === true)
                      }
                      className="mt-0.5"
                      disabled={isToggleDisabled}
                    />
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Label
                          htmlFor={`${title}-${item.name}`}
                          className="text-sm font-medium"
                        >
                          {item.label || item.name}
                        </Label>
                        <Badge
                          variant="secondary"
                          className="font-mono text-[10px]"
                        >
                          {item.name}
                        </Badge>
                        {isLocked && (
                          <Badge variant="outline" className="text-[10px]">
                            Required
                          </Badge>
                        )}
                        {item.accessLevel === "read" ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] gap-0.5"
                          >
                            <Eye className="h-2.5 w-2.5" />
                            Read
                          </Badge>
                        ) : item.accessLevel === "write" ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] gap-0.5"
                          >
                            <Pencil className="h-2.5 w-2.5" />
                            Write
                          </Badge>
                        ) : null}
                        {item.name === "browseChrome" && (
                          <>
                            <Badge variant="outline" className="text-[10px]">
                              Local only
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                              Signed-in Chrome
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                              Interactive
                            </Badge>
                          </>
                        )}
                        {item.availability === "setup_required" && (
                          <Badge variant="secondary" className="text-[10px]">
                            Setup required
                          </Badge>
                        )}
                        {item.availability === "disabled" && (
                          <Badge variant="secondary" className="text-[10px]">
                            Disabled
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {item.description}
                      </p>
                      {item.availabilityReason && (
                        <p className="text-xs text-muted-foreground">
                          {item.availabilityReason}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

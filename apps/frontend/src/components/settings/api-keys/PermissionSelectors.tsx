import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type {
  AccessLevelInfo,
  AdminAccessLevel,
  DataAccessLevel,
} from "@/lib/api-actors";

interface PermissionSelectorsProps {
  prefix: string;
  isAdmin: boolean;
  dataAccessLevels: Record<DataAccessLevel, AccessLevelInfo>;
  adminAccessLevels: Record<AdminAccessLevel, AccessLevelInfo>;
  dataAccess: DataAccessLevel;
  onDataAccessChange: (v: DataAccessLevel) => void;
  adminAccess: AdminAccessLevel;
  onAdminAccessChange: (v: AdminAccessLevel) => void;
}

/** Data / admin access radio groups shared by the create & edit key dialogs. */
export function PermissionSelectors({
  prefix,
  isAdmin,
  dataAccessLevels,
  adminAccessLevels,
  dataAccess,
  onDataAccessChange,
  adminAccess,
  onAdminAccessChange,
}: PermissionSelectorsProps) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label>Data access</Label>
        <RadioGroup
          value={dataAccess}
          onValueChange={(v) => onDataAccessChange(v as DataAccessLevel)}
          className="grid gap-2"
        >
          {(
            Object.entries(dataAccessLevels) as [
              DataAccessLevel,
              { label: string; description: string },
            ][]
          ).map(([value, info]) => (
            <div key={value} className="flex items-start gap-3">
              <RadioGroupItem
                value={value}
                id={`${prefix}-data-${value}`}
                className="mt-0.5"
              />
              <div className="space-y-0.5">
                <Label
                  htmlFor={`${prefix}-data-${value}`}
                  className="cursor-pointer text-sm font-medium"
                >
                  {info.label}
                </Label>
                <div className="text-xs text-muted-foreground">
                  {info.description}
                </div>
              </div>
            </div>
          ))}
        </RadioGroup>
      </div>

      {isAdmin && (
        <div className="grid gap-2">
          <Label>Admin access</Label>
          <RadioGroup
            value={adminAccess}
            onValueChange={(v) => onAdminAccessChange(v as AdminAccessLevel)}
            className="grid gap-2"
          >
            {(
              Object.entries(adminAccessLevels) as [
                AdminAccessLevel,
                { label: string; description: string },
              ][]
            ).map(([value, info]) => (
              <div key={value} className="flex items-start gap-3">
                <RadioGroupItem
                  value={value}
                  id={`${prefix}-admin-${value}`}
                  className="mt-0.5"
                />
                <div className="space-y-0.5">
                  <Label
                    htmlFor={`${prefix}-admin-${value}`}
                    className="cursor-pointer text-sm font-medium"
                  >
                    {info.label}
                  </Label>
                  <div className="text-xs text-muted-foreground">
                    {info.description}
                  </div>
                </div>
              </div>
            ))}
          </RadioGroup>
        </div>
      )}
    </div>
  );
}

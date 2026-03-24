import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api-client";

interface ProviderRow {
  id: string;
  dialect: string;
  baseUrl: string | null;
  auth: { type: string; header?: string; value?: string };
  createdAt: string;
}

interface ProviderPreset {
  id: string;
  name: string;
  description: string;
  isCloud: boolean;
  supportsCatalogDiscovery: boolean;
  config: {
    dialect: string;
    baseUrl: string;
    auth: { type: string; requiresApiKey: boolean; envVar?: string };
  };
}

const DIALECTS = [
  { value: "openai_compatible", label: "OpenAI Compatible" },
  { value: "anthropic_messages", label: "Anthropic Messages" },
  { value: "mlx_native", label: "MLX Native" },
  { value: "cli_jsonl", label: "CLI JSONL" },
];

// Environment variable reference placeholders for provider auth values.
// Written as template expressions to avoid biome's noTemplateCurlyInString lint
// while also avoiding oxlint's no-useless-concat.
function envRef(name: string): string {
  return `\${ENV:${name}}`;
}

interface FormState {
  id: string;
  dialect: string;
  baseUrl: string;
  authType: string;
  authHeader: string;
  authValue: string;
}

const EMPTY_FORM: FormState = {
  id: "",
  dialect: "openai_compatible",
  baseUrl: "",
  authType: "none",
  authHeader: "",
  authValue: "",
};

export default function ProviderManager() {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [presets, setPresets] = useState<ProviderPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [providersRes, presetsRes] = await Promise.all([
        apiGet("/api/admin/providers"),
        apiGet("/api/admin/provider-presets"),
      ]);
      const providersData = await providersRes.json();
      const presetsData = await presetsRes.json();
      setProviders(providersData.items);
      setPresets(presetsData.items);
    } catch {
      toast.error("Failed to load providers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const applyPreset = (presetId: string) => {
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;

    // Build auth value with env var reference if needed
    let authValue = "";
    if (preset.config.auth.requiresApiKey && preset.config.auth.envVar) {
      authValue = envRef(preset.config.auth.envVar);
    }

    // For anthropic, use custom header auth
    let authHeader = "";
    if (preset.config.auth.type === "header") {
      authHeader = "x-api-key";
    }

    setForm({
      id: preset.id,
      dialect: preset.config.dialect,
      baseUrl: preset.config.baseUrl,
      authType: preset.config.auth.type,
      authHeader,
      authValue,
    });
  };

  const handleAdd = async () => {
    if (!form.id || !form.dialect) {
      toast.error("Provider ID and dialect are required");
      return;
    }
    try {
      const auth: Record<string, string> = { type: form.authType };
      if (form.authType === "bearer" && form.authValue) {
        auth.value = form.authValue;
      } else if (form.authType === "header") {
        if (form.authHeader) auth.header = form.authHeader;
        if (form.authValue) auth.value = form.authValue;
      }
      await apiPost("/api/admin/providers", {
        id: form.id,
        dialect: form.dialect,
        baseUrl: form.baseUrl || undefined,
        auth,
      });

      // Check if the preset supports catalog discovery
      const preset = presets.find((p) => p.id === form.id);
      if (preset?.supportsCatalogDiscovery) {
        toast.success(
          `Provider "${form.id}" created. You can now add models from this provider on the Models page.`,
        );
      } else {
        toast.success(`Provider "${form.id}" created`);
      }

      setAddOpen(false);
      setForm(EMPTY_FORM);
      load();
    } catch {
      toast.error("Failed to create provider");
    }
  };

  const handleEdit = async () => {
    if (!editingId) return;
    try {
      const auth: Record<string, string> = { type: form.authType };
      if (form.authType === "bearer" && form.authValue) {
        auth.value = form.authValue;
      } else if (form.authType === "header") {
        if (form.authHeader) auth.header = form.authHeader;
        if (form.authValue) auth.value = form.authValue;
      }
      await apiPut(`/api/admin/providers/${editingId}`, {
        dialect: form.dialect,
        baseUrl: form.baseUrl || undefined,
        auth,
      });
      toast.success(`Provider "${editingId}" updated`);
      setEditOpen(false);
      setEditingId(null);
      load();
    } catch {
      toast.error("Failed to update provider");
    }
  };

  const openEdit = (p: ProviderRow) => {
    setEditingId(p.id);
    setForm({
      id: p.id,
      dialect: p.dialect,
      baseUrl: p.baseUrl ?? "",
      authType: p.auth?.type ?? "none",
      authHeader: (p.auth as Record<string, string>)?.header ?? "",
      authValue: (p.auth as Record<string, string>)?.value ?? "",
    });
    setEditOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (
      !confirm(
        `Delete provider "${id}"? Models using this provider will also be deleted.`,
      )
    ) {
      return;
    }
    try {
      await apiDelete(`/api/admin/providers/${id}`);
      toast.success(`Provider "${id}" deleted`);
      load();
    } catch {
      toast.error("Failed to delete provider");
    }
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    try {
      const res = await apiPost(`/api/admin/providers/${id}/test`);
      const data = await res.json();
      if (data.success) {
        toast.success(`Connection to "${id}" successful (${data.status})`);
      } else {
        toast.error(
          `Connection to "${id}" failed: ${data.error || data.statusText}`,
        );
      }
    } catch {
      toast.error("Failed to test connection");
    } finally {
      setTesting(null);
    }
  };

  const renderForm = (isEdit: boolean) => (
    <div className="grid gap-4 py-4">
      {!isEdit && (
        <div className="space-y-2">
          <Label>Quick Setup</Label>
          <Select onValueChange={applyPreset}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a preset..." />
            </SelectTrigger>
            <SelectContent>
              {presets
                .filter((p) => p.id !== "custom")
                .map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span>{p.name}</span>
                    <span className="ml-2 text-muted-foreground text-xs">
                      {p.description}
                    </span>
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {!isEdit && (
        <div className="space-y-2">
          <Label htmlFor="provider-id">Provider ID</Label>
          <Input
            id="provider-id"
            value={form.id}
            onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
            placeholder="e.g. ollama, openai-cloud"
          />
        </div>
      )}
      <div className="space-y-2">
        <Label>Dialect</Label>
        <Select
          value={form.dialect}
          onValueChange={(v) => setForm((f) => ({ ...f, dialect: v }))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DIALECTS.map((d) => (
              <SelectItem key={d.value} value={d.value}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="base-url">Base URL</Label>
        <Input
          id="base-url"
          value={form.baseUrl}
          onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
          placeholder="http://127.0.0.1:11434/v1"
        />
      </div>
      <div className="space-y-2">
        <Label>Authentication</Label>
        <Select
          value={form.authType}
          onValueChange={(v) => setForm((f) => ({ ...f, authType: v }))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="bearer">Bearer Token</SelectItem>
            <SelectItem value="header">Custom Header</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {form.authType === "header" && (
        <div className="space-y-2">
          <Label htmlFor="auth-header">Header Name</Label>
          <Input
            id="auth-header"
            value={form.authHeader}
            onChange={(e) =>
              setForm((f) => ({ ...f, authHeader: e.target.value }))
            }
            placeholder="x-api-key"
          />
        </div>
      )}
      {form.authType !== "none" && (
        <div className="space-y-2">
          <Label htmlFor="auth-value">
            {form.authType === "bearer" ? "Token" : "Header Value"}
          </Label>
          <Input
            id="auth-value"
            value={form.authValue}
            onChange={(e) =>
              setForm((f) => ({ ...f, authValue: e.target.value }))
            }
            placeholder={envRef("API_KEY")}
          />
          <p className="text-xs text-muted-foreground">
            {"Use $"}
            {"{ENV:VAR_NAME}"}
            {" to reference environment variables."}
          </p>
        </div>
      )}
    </div>
  );

  if (loading)
    return (
      <p className="text-sm text-muted-foreground">Loading providers...</p>
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Providers</h3>
          <p className="text-sm text-muted-foreground">
            AI provider connections. Providers define how to reach inference
            servers.
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button
              size="sm"
              onClick={() => {
                setForm(EMPTY_FORM);
                setAddOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Provider
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Provider</DialogTitle>
              <DialogDescription>
                Configure a new AI provider connection.
              </DialogDescription>
            </DialogHeader>
            {renderForm(false)}
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAdd}>Add Provider</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {providers.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">
          No providers configured. Add a provider to get started.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Dialect</TableHead>
              <TableHead>Base URL</TableHead>
              <TableHead>Auth</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {providers.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-sm">{p.id}</TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {DIALECTS.find((d) => d.value === p.dialect)?.label ??
                      p.dialect}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                  {p.baseUrl || "-"}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{p.auth?.type ?? "none"}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Test connection"
                      onClick={() => handleTest(p.id)}
                      disabled={testing === p.id}
                    >
                      <Play
                        className={`h-4 w-4 ${testing === p.id ? "animate-pulse" : ""}`}
                      />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Edit"
                      onClick={() => openEdit(p)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Delete"
                      onClick={() => handleDelete(p.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Provider: {editingId}</DialogTitle>
            <DialogDescription>
              Update the provider configuration.
            </DialogDescription>
          </DialogHeader>
          {renderForm(true)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

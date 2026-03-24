import { useCallback, useEffect, useState } from "react";
import { Globe, Pencil, Link, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
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
import ModelCatalogDialog from "./ModelCatalogDialog";
import ModelImportUrlDialog from "./ModelImportUrlDialog";

interface ModelRow {
  id: string;
  name: string;
  providerId: string;
  providerModel: string;
  capabilities: Record<string, unknown>;
  source?: { url?: string } | null;
}

interface ProviderOption {
  id: string;
  dialect: string;
}

interface FormState {
  id: string;
  name: string;
  providerId: string;
  providerModel: string;
  streaming: boolean;
  tools: boolean;
  reasoning: boolean;
  inputText: boolean;
  inputImage: boolean;
}

const EMPTY_FORM: FormState = {
  id: "",
  name: "",
  providerId: "",
  providerModel: "",
  streaming: true,
  tools: false,
  reasoning: false,
  inputText: true,
  inputImage: false,
};

const NO_MODEL_VALUE = "__none__";

function getCapabilityBadges(caps: Record<string, unknown>) {
  const badges: string[] = [];
  const modalities = caps.modalities as
    | { input?: string[]; output?: string[] }
    | undefined;
  if (modalities?.input?.includes("image")) badges.push("vision");
  if (caps.tools) badges.push("tools");
  if (caps.streaming) badges.push("stream");
  const reasoning = caps.reasoning as { supported?: boolean } | undefined;
  if (reasoning?.supported) badges.push("reasoning");
  return badges;
}

export default function ModelManager() {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Default assignments
  const [selection, setSelection] = useState<Record<string, string | null>>({
    backend: null,
    workers: null,
  });

  // Manual add dialog
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Import dialogs
  const [urlDialogOpen, setUrlDialogOpen] = useState(false);
  const [catalogDialogOpen, setCatalogDialogOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [modelsRes, providersRes, selectionRes] = await Promise.all([
        apiGet("/api/admin/models"),
        apiGet("/api/admin/providers"),
        apiGet("/api/admin/model-selection"),
      ]);
      const modelsData = await modelsRes.json();
      const providersData = await providersRes.json();
      const selectionData = await selectionRes.json();
      setModels(modelsData.items);
      setProviders(providersData.items);
      setSelection({
        backend: selectionData.backend ?? null,
        workers: selectionData.workers ?? null,
      });
    } catch {
      toast.error("Failed to load models");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Group models by provider for selection dropdowns
  const grouped = models.reduce<Record<string, ModelRow[]>>((acc, model) => {
    const key = model.providerId;
    if (!acc[key]) acc[key] = [];
    acc[key].push(model);
    return acc;
  }, {});
  const providerGroups = Object.keys(grouped).sort();

  async function handleModelChange(
    context: "backend" | "workers",
    modelId: string | null,
  ) {
    if (!modelId) return;
    try {
      await apiPut(`/api/admin/model-selection/${context}`, { modelId });
      setSelection((prev) => ({ ...prev, [context]: modelId }));
      toast.success(`Default ${context} model updated`);
    } catch {
      toast.error("Failed to update model selection");
    }
  }

  function formToCapabilities(f: FormState) {
    return {
      modalities: {
        input: [
          ...(f.inputText ? ["text"] : []),
          ...(f.inputImage ? ["image"] : []),
        ],
        output: ["text"],
      },
      streaming: f.streaming,
      tools: f.tools,
      reasoning: f.reasoning
        ? { supported: true, mode: "prompt-controlled" }
        : { supported: false },
    };
  }

  function capsToForm(caps: Record<string, unknown>): Partial<FormState> {
    const modalities = caps.modalities as { input?: string[] } | undefined;
    const reasoning = caps.reasoning as { supported?: boolean } | undefined;
    return {
      streaming: (caps.streaming as boolean) ?? true,
      tools: (caps.tools as boolean) ?? false,
      reasoning: reasoning?.supported ?? false,
      inputText: modalities?.input?.includes("text") ?? true,
      inputImage: modalities?.input?.includes("image") ?? false,
    };
  }

  const handleAdd = async () => {
    if (!form.id || !form.name || !form.providerId || !form.providerModel) {
      toast.error("All fields are required");
      return;
    }
    try {
      await apiPost("/api/admin/models", {
        id: form.id,
        name: form.name,
        provider: form.providerId,
        providerModel: form.providerModel,
        capabilities: formToCapabilities(form),
      });
      toast.success(`Model "${form.id}" created`);
      setAddOpen(false);
      setForm(EMPTY_FORM);
      load();
    } catch {
      toast.error("Failed to create model");
    }
  };

  const handleEdit = async () => {
    if (!editingId) return;
    try {
      await apiPut(`/api/admin/models/${editingId}`, {
        name: form.name,
        provider: form.providerId,
        providerModel: form.providerModel,
        capabilities: formToCapabilities(form),
      });
      toast.success(`Model "${editingId}" updated`);
      setEditOpen(false);
      setEditingId(null);
      load();
    } catch {
      toast.error("Failed to update model");
    }
  };

  const openEdit = (m: ModelRow) => {
    setEditingId(m.id);
    const caps = capsToForm(m.capabilities);
    setForm({
      id: m.id,
      name: m.name,
      providerId: m.providerId,
      providerModel: m.providerModel,
      streaming: caps.streaming ?? true,
      tools: caps.tools ?? false,
      reasoning: caps.reasoning ?? false,
      inputText: caps.inputText ?? true,
      inputImage: caps.inputImage ?? false,
    });
    setEditOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`Delete model "${id}"?`)) return;
    try {
      await apiDelete(`/api/admin/models/${id}`);
      toast.success(`Model "${id}" deleted`);
      load();
    } catch {
      toast.error("Failed to delete model");
    }
  };

  const renderForm = (isEdit: boolean) => (
    <div className="grid gap-4 py-4">
      {!isEdit && (
        <div className="space-y-2">
          <Label htmlFor="model-id">Model ID</Label>
          <Input
            id="model-id"
            value={form.id}
            onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
            placeholder="e.g. ollama:llama3.2"
          />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="model-name">Display Name</Label>
        <Input
          id="model-name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Llama 3.2"
        />
      </div>
      <div className="space-y-2">
        <Label>Provider</Label>
        <Select
          value={form.providerId}
          onValueChange={(v) => setForm((f) => ({ ...f, providerId: v }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select provider..." />
          </SelectTrigger>
          <SelectContent>
            {providers.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="provider-model">Provider Model ID</Label>
        <Input
          id="provider-model"
          value={form.providerModel}
          onChange={(e) =>
            setForm((f) => ({ ...f, providerModel: e.target.value }))
          }
          placeholder="e.g. llama3.2:latest"
        />
        <p className="text-xs text-muted-foreground">
          The model identifier as expected by the provider's API.
        </p>
      </div>
      <div className="space-y-3">
        <Label>Capabilities</Label>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.inputText}
              onCheckedChange={(c) =>
                setForm((f) => ({ ...f, inputText: c === true }))
              }
            />
            Text input
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.inputImage}
              onCheckedChange={(c) =>
                setForm((f) => ({ ...f, inputImage: c === true }))
              }
            />
            Image input (vision)
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.streaming}
              onCheckedChange={(c) =>
                setForm((f) => ({ ...f, streaming: c === true }))
              }
            />
            Streaming
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.tools}
              onCheckedChange={(c) =>
                setForm((f) => ({ ...f, tools: c === true }))
              }
            />
            Tool calling
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.reasoning}
              onCheckedChange={(c) =>
                setForm((f) => ({ ...f, reasoning: c === true }))
              }
            />
            Reasoning
          </div>
        </div>
      </div>
    </div>
  );

  if (loading)
    return <p className="text-sm text-muted-foreground">Loading models...</p>;

  return (
    <div className="space-y-6">
      {/* Section 1: Default Assignments */}
      <Card>
        <CardHeader>
          <CardTitle>Default Assignments</CardTitle>
          <CardDescription>
            Select which AI models are used by default for different contexts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="backend-model">Backend (text-only)</Label>
              <Select
                value={selection.backend ?? NO_MODEL_VALUE}
                onValueChange={(v) =>
                  handleModelChange("backend", v === NO_MODEL_VALUE ? null : v)
                }
              >
                <SelectTrigger id="backend-model">
                  <SelectValue placeholder="Select a model..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_MODEL_VALUE}>Not set</SelectItem>
                  {providerGroups.length > 0 && <SelectSeparator />}
                  {providerGroups.map((provider) => (
                    <SelectGroup key={provider}>
                      <SelectLabel>{provider}</SelectLabel>
                      {(grouped[provider] ?? []).map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Used for chat, agents, and text processing.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="workers-model">Workers (text + vision)</Label>
              <Select
                value={selection.workers ?? NO_MODEL_VALUE}
                onValueChange={(v) =>
                  handleModelChange("workers", v === NO_MODEL_VALUE ? null : v)
                }
              >
                <SelectTrigger id="workers-model">
                  <SelectValue placeholder="Select a model..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_MODEL_VALUE}>Not set</SelectItem>
                  {providerGroups.length > 0 && <SelectSeparator />}
                  {providerGroups.map((provider) => (
                    <SelectGroup key={provider}>
                      <SelectLabel>{provider}</SelectLabel>
                      {(grouped[provider] ?? []).map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Used for background processing (bookmarks, documents, photos).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Models Table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Models</h3>
            <p className="text-sm text-muted-foreground">
              AI models available for use. Each model is linked to a provider.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCatalogDialogOpen(true)}
            >
              <Globe className="mr-2 h-4 w-4" />
              Add from provider
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setUrlDialogOpen(true)}
            >
              <Link className="mr-2 h-4 w-4" />
              Import from URL
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setForm(EMPTY_FORM);
                setAddOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add manually
            </Button>
          </div>
        </div>

        {models.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No models configured. Add a model to get started.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Capabilities</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {models.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-mono text-sm">
                    <div className="flex items-center gap-2">
                      {m.id}
                      {selection.backend === m.id && (
                        <Badge
                          variant="default"
                          className="text-[10px] px-1.5 py-0"
                        >
                          backend
                        </Badge>
                      )}
                      {selection.workers === m.id && (
                        <Badge
                          variant="default"
                          className="text-[10px] px-1.5 py-0"
                        >
                          workers
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{m.name}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {m.providerId}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {getCapabilityBadges(m.capabilities).map((badge) => (
                        <Badge
                          key={badge}
                          variant="secondary"
                          className="text-xs"
                        >
                          {badge}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Edit"
                        onClick={() => openEdit(m)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Delete"
                        onClick={() => handleDelete(m.id)}
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
      </div>

      {/* Manual Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Model Manually</DialogTitle>
            <DialogDescription>
              Register a new AI model with its capabilities.
            </DialogDescription>
          </DialogHeader>
          {renderForm(false)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd}>Add Model</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Model: {editingId}</DialogTitle>
            <DialogDescription>
              Update the model configuration.
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

      {/* Import from URL Dialog */}
      <ModelImportUrlDialog
        open={urlDialogOpen}
        onOpenChange={setUrlDialogOpen}
        providers={providers}
        onImported={load}
      />

      {/* Add from Provider Catalog Dialog */}
      <ModelCatalogDialog
        open={catalogDialogOpen}
        onOpenChange={setCatalogDialogOpen}
        providers={providers}
        onImported={load}
      />
    </div>
  );
}

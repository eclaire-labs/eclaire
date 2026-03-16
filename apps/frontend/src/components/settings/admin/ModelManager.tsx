import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

interface ModelRow {
  id: string;
  name: string;
  providerId: string;
  providerModel: string;
  capabilities: Record<string, unknown>;
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
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [modelsRes, providersRes] = await Promise.all([
        apiGet("/api/admin/models"),
        apiGet("/api/admin/providers"),
      ]);
      const modelsData = await modelsRes.json();
      const providersData = await providersRes.json();
      setModels(modelsData.items);
      setProviders(providersData.items);
    } catch {
      toast.error("Failed to load models");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Models</h3>
          <p className="text-sm text-muted-foreground">
            AI models available for use. Each model is linked to a provider.
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
              Add Model
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Model</DialogTitle>
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
                <TableCell className="font-mono text-sm">{m.id}</TableCell>
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
    </div>
  );
}

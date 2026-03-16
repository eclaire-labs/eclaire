import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api-client";

interface McpServerRow {
  id: string;
  name: string;
  description: string | null;
  transport: "stdio" | "sse" | "http";
  command: string | null;
  args: string[] | null;
  connectTimeout: number | null;
  enabled: boolean;
  toolMode: string | null;
  availability: Record<string, unknown> | null;
}

const TRANSPORTS = [
  { value: "stdio", label: "Stdio" },
  { value: "sse", label: "SSE" },
  { value: "http", label: "HTTP" },
];

const TOOL_MODES = [
  { value: "managed", label: "Managed" },
  { value: "individual", label: "Individual" },
  { value: "grouped", label: "Grouped" },
];

const NO_TOOL_MODE = "__none__";

interface FormState {
  id: string;
  name: string;
  description: string;
  transport: "stdio" | "sse" | "http";
  command: string;
  args: string;
  connectTimeout: string;
  enabled: boolean;
  toolMode: string;
}

const EMPTY_FORM: FormState = {
  id: "",
  name: "",
  description: "",
  transport: "stdio",
  command: "",
  args: "",
  connectTimeout: "",
  enabled: true,
  toolMode: NO_TOOL_MODE,
};

export default function McpServerManager() {
  const [servers, setServers] = useState<McpServerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiGet("/api/admin/mcp-servers");
      const data = await res.json();
      setServers(data.items);
    } catch {
      toast.error("Failed to load MCP servers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function formToPayload(f: FormState) {
    const argsArray = f.args
      ? f.args
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean)
      : null;
    return {
      id: f.id,
      name: f.name,
      description: f.description || null,
      transport: f.transport,
      command: f.command || null,
      args: argsArray,
      connectTimeout: f.connectTimeout
        ? Number.parseInt(f.connectTimeout, 10)
        : null,
      enabled: f.enabled,
      toolMode: f.toolMode === NO_TOOL_MODE ? null : f.toolMode,
    };
  }

  const handleAdd = async () => {
    if (!form.id || !form.name) {
      toast.error("Server ID and name are required");
      return;
    }
    try {
      await apiPost("/api/admin/mcp-servers", formToPayload(form));
      toast.success(`MCP server "${form.id}" created`);
      setAddOpen(false);
      setForm(EMPTY_FORM);
      load();
    } catch {
      toast.error("Failed to create MCP server");
    }
  };

  const handleEdit = async () => {
    if (!editingId) return;
    try {
      const payload = formToPayload(form);
      const { id: _id, ...body } = payload;
      await apiPut(`/api/admin/mcp-servers/${editingId}`, body);
      toast.success(`MCP server "${editingId}" updated`);
      setEditOpen(false);
      setEditingId(null);
      load();
    } catch {
      toast.error("Failed to update MCP server");
    }
  };

  const openEdit = (s: McpServerRow) => {
    setEditingId(s.id);
    setForm({
      id: s.id,
      name: s.name,
      description: s.description ?? "",
      transport: s.transport,
      command: s.command ?? "",
      args: s.args?.join(", ") ?? "",
      connectTimeout: s.connectTimeout?.toString() ?? "",
      enabled: s.enabled,
      toolMode: s.toolMode ?? NO_TOOL_MODE,
    });
    setEditOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`Delete MCP server "${id}"?`)) return;
    try {
      await apiDelete(`/api/admin/mcp-servers/${id}`);
      toast.success(`MCP server "${id}" deleted`);
      load();
    } catch {
      toast.error("Failed to delete MCP server");
    }
  };

  const handleToggleEnabled = async (s: McpServerRow) => {
    try {
      await apiPut(`/api/admin/mcp-servers/${s.id}`, {
        enabled: !s.enabled,
      });
      toast.success(
        `MCP server "${s.id}" ${s.enabled ? "disabled" : "enabled"}`,
      );
      load();
    } catch {
      toast.error("Failed to update MCP server");
    }
  };

  /** Returns the command (for stdio) or a dash for other transports. */
  function getCommandDisplay(s: McpServerRow): string {
    if (s.transport === "stdio") return s.command || "-";
    return "-";
  }

  const renderForm = (isEdit: boolean) => (
    <div className="grid gap-4 py-4">
      <div className="space-y-2">
        <Label htmlFor="server-id">Server ID</Label>
        <Input
          id="server-id"
          value={form.id}
          onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
          placeholder="e.g. filesystem, github"
          disabled={isEdit}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="server-name">Name</Label>
        <Input
          id="server-name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Filesystem Server"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="server-description">Description</Label>
        <Input
          id="server-description"
          value={form.description}
          onChange={(e) =>
            setForm((f) => ({ ...f, description: e.target.value }))
          }
          placeholder="Optional description"
        />
      </div>
      <div className="space-y-2">
        <Label>Transport</Label>
        <Select
          value={form.transport}
          onValueChange={(v) =>
            setForm((f) => ({
              ...f,
              transport: v as "stdio" | "sse" | "http",
            }))
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TRANSPORTS.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {form.transport === "stdio" && (
        <>
          <div className="space-y-2">
            <Label htmlFor="server-command">Command</Label>
            <Input
              id="server-command"
              value={form.command}
              onChange={(e) =>
                setForm((f) => ({ ...f, command: e.target.value }))
              }
              placeholder="e.g. npx, python"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="server-args">Arguments</Label>
            <Input
              id="server-args"
              value={form.args}
              onChange={(e) => setForm((f) => ({ ...f, args: e.target.value }))}
              placeholder="Comma-separated, e.g. -y, @modelcontextprotocol/server-filesystem"
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated list of command arguments.
            </p>
          </div>
        </>
      )}
      <div className="space-y-2">
        <Label htmlFor="server-timeout">Connect Timeout (ms)</Label>
        <Input
          id="server-timeout"
          type="number"
          value={form.connectTimeout}
          onChange={(e) =>
            setForm((f) => ({ ...f, connectTimeout: e.target.value }))
          }
          placeholder="Default"
        />
      </div>
      <div className="space-y-2">
        <Label>Tool Mode</Label>
        <Select
          value={form.toolMode}
          onValueChange={(v) => setForm((f) => ({ ...f, toolMode: v }))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_TOOL_MODE}>Not set</SelectItem>
            {TOOL_MODES.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor="server-enabled">Enabled</Label>
        <Switch
          id="server-enabled"
          checked={form.enabled}
          onCheckedChange={(checked) =>
            setForm((f) => ({ ...f, enabled: checked }))
          }
        />
      </div>
    </div>
  );

  if (loading)
    return (
      <p className="text-sm text-muted-foreground">Loading MCP servers...</p>
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">MCP Servers</h3>
          <p className="text-sm text-muted-foreground">
            Model Context Protocol servers that provide tools and resources to
            agents.
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
              Add Server
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add MCP Server</DialogTitle>
              <DialogDescription>
                Configure a new MCP server connection.
              </DialogDescription>
            </DialogHeader>
            {renderForm(false)}
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAdd}>Add Server</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {servers.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">
          No MCP servers configured. Add a server to get started.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Transport</TableHead>
              <TableHead>Command/URL</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {servers.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-mono text-sm">{s.id}</TableCell>
                <TableCell>{s.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{s.transport}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                  {getCommandDisplay(s)}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={s.enabled}
                    onCheckedChange={() => handleToggleEnabled(s)}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Edit"
                      onClick={() => openEdit(s)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Delete"
                      onClick={() => handleDelete(s.id)}
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
            <DialogTitle>Edit MCP Server: {editingId}</DialogTitle>
            <DialogDescription>
              Update the MCP server configuration.
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

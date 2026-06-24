"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type User = {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: "admin" | "user";
  modelOverrideProviderId?: string | null;
};

type Tenant = {
  id: string;
  name: string;
  soul: string;
  generalBehavior: string;
  defaultProviderId: string | null;
} | null;

type Provider = {
  id: string;
  kind: "openai" | "anthropic" | "google" | "ollama" | "custom";
  name: string;
  endpointUrl: string | null;
  model: string;
  modelAlias: string | null;
  enabled: boolean;
  hasApiKey: boolean;
};

type UserMemory = {
  id: string;
  userId: string;
  type: "fact" | "preference" | "decision";
  content: string;
  tags: string;
  summary: string;
  userName?: string;
};

type OrgMemory = {
  id: string;
  title: string;
  sourceType: "text" | "link" | "pdf" | "image";
  summary: string;
  tags: string;
  fileName: string | null;
};

type BehaviorMemory = {
  id: string;
  content: string;
  summary: string;
  tags: string;
};

type SettingsFormProps = {
  user: User;
  tenant: Tenant;
  users: User[];
  providers: Provider[];
  userMemories: UserMemory[];
  orgMemories: OrgMemory[];
  behaviorMemories: BehaviorMemory[];
};

type ProviderDraft = Provider & {
  apiKey?: string;
};

type Tab = "soul" | "providers" | "users" | "memories";

const providerKindLabels: Record<Provider["kind"], string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  ollama: "Ollama",
  custom: "Compatível OpenAI",
};

function modelLabel(provider: Provider | ProviderDraft | null) {
  if (!provider) return "Nenhum";
  const p = provider;
  return `${p.modelAlias || p.name} / ${p.model}`;
}

function emptyProvider(): ProviderDraft {
  return {
    id: "",
    kind: "custom",
    name: "",
    endpointUrl: "",
    model: "",
    modelAlias: "",
    enabled: true,
    hasApiKey: false,
    apiKey: "",
  };
}

export function SettingsForm({
  user,
  tenant,
  users,
  providers: initialProviders,
  userMemories: initialUserMemories,
  orgMemories: initialOrgMemories,
  behaviorMemories: initialBehaviorMemories,
}: SettingsFormProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("soul");
  const [soul, setSoul] = useState(tenant?.soul ?? "");
  const [generalBehavior, setGeneralBehavior] = useState(tenant?.generalBehavior ?? "");
  const [defaultProviderId, setDefaultProviderId] = useState(tenant?.defaultProviderId ?? "none");
  const [providers, setProviders] = useState<ProviderDraft[]>(initialProviders);
  const [newProvider, setNewProvider] = useState<ProviderDraft>(emptyProvider());
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [ollamaModels, setOllamaModels] = useState<Record<string, string[]>>({});
  const [memoryType, setMemoryType] = useState<UserMemory["type"]>("fact");
  const [memoryUserId, setMemoryUserId] = useState(user.id);
  const [memoryContent, setMemoryContent] = useState("");
  const [memoryEditId, setMemoryEditId] = useState<string | null>(null);
  const [userMemories, setUserMemories] = useState(initialUserMemories);
  const [orgMemories, setOrgMemories] = useState(initialOrgMemories);
  const [behaviorMemories, setBehaviorMemories] = useState(initialBehaviorMemories);
  const [behaviorContent, setBehaviorContent] = useState("");
  const [behaviorEditId, setBehaviorEditId] = useState<string | null>(null);

  // Org memory form
  const [orgTitle, setOrgTitle] = useState("");
  const [orgSourceType, setOrgSourceType] = useState<"text" | "link" | "pdf" | "image">("text");
  const [orgContent, setOrgContent] = useState("");
  const [orgUrl, setOrgUrl] = useState("");

  async function refreshSettings() {
    const response = await fetch("/api/settings", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as {
      providers: Provider[];
      userMemories: UserMemory[];
      orgMemories: OrgMemory[];
      behaviorMemories: BehaviorMemory[];
    };
    setProviders(data.providers);
    setUserMemories(data.userMemories);
    setOrgMemories(data.orgMemories);
    setBehaviorMemories(data.behaviorMemories);
    router.refresh();
  }

  async function saveTenant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        soul,
        generalBehavior,
        defaultProviderId: defaultProviderId === "none" ? null : defaultProviderId,
      }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      toast.error(data?.error || "Não foi possível salvar.");
      return;
    }
    toast.success("Configurações salvas.");
    router.refresh();
  }

  async function saveProvider(provider: ProviderDraft) {
    const response = await fetch("/api/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: provider.id || undefined,
        kind: provider.kind,
        name: provider.name,
        endpointUrl: provider.endpointUrl,
        apiKey: provider.apiKey || undefined,
        model: provider.model,
        modelAlias: provider.modelAlias,
        enabled: provider.enabled,
      }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      toast.error(data?.error || "Não foi possível salvar provedor.");
      return;
    }
    toast.success("Provedor salvo.");
    setNewProvider(emptyProvider());
    await refreshSettings();
  }

  async function deleteProvider(id: string) {
    if (!window.confirm("Tem certeza que deseja excluir este provedor?")) return;
    const response = await fetch(`/api/providers/${id}`, { method: "DELETE" });
    if (!response.ok) {
      toast.error("Não foi possível excluir o provedor.");
      return;
    }
    toast.success("Provedor excluído.");
    await refreshSettings();
  }

  async function fetchOllamaModels(provider: ProviderDraft) {
    const response = await fetch("/api/providers/ollama-models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpointUrl: provider.endpointUrl, apiKey: provider.apiKey }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      toast.error(data?.error || "Falha ao buscar modelos.");
      return;
    }
    const data = (await response.json()) as { models: string[] };
    setOllamaModels((items) => ({ ...items, [provider.id || "new"]: data.models }));
    toast.success(`${data.models.length} modelo(s) encontrados.`);
  }

  async function saveOverride(targetUserId: string, providerId: string) {
    const response = await fetch(`/api/users/${targetUserId}/model-override`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId: providerId === "none" ? null : providerId }),
    });
    if (!response.ok) {
      toast.error("Não foi possível salvar override.");
      return;
    }
    toast.success("Override salvo.");
    router.refresh();
  }

  async function saveUserMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/user-memories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: memoryEditId ?? undefined, type: memoryType, userId: memoryUserId, content: memoryContent }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      toast.error(data?.error || "Não foi possível salvar memória.");
      return;
    }
    setMemoryContent("");
    setMemoryEditId(null);
    toast.success("Memória salva.");
    await refreshSettings();
  }

  async function deleteUserMemory(id: string) {
    if (!window.confirm("Tem certeza que deseja excluir esta memória do usuário?")) return;
    await fetch(`/api/user-memories/${id}`, { method: "DELETE" });
    setUserMemories((items) => items.filter((memory) => memory.id !== id));
  }

  function editUserMemory(memory: UserMemory) {
    setMemoryEditId(memory.id);
    setMemoryType(memory.type);
    setMemoryUserId(memory.userId);
    setMemoryContent(memory.content);
  }

  async function saveOrgMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body: Record<string, unknown> = {
      title: orgTitle,
      sourceType: orgSourceType,
      content: orgContent,
      url: orgUrl || null,
    };

    // If PDF or image, send as FormData with file
    const fileInput = (event.target as HTMLFormElement).querySelector<HTMLInputElement>('input[type="file"]');
    const file = fileInput?.files?.[0];
    if ((orgSourceType === "pdf" || orgSourceType === "image") && file) {
      const formData = new FormData();
      formData.append("title", orgTitle);
      formData.append("sourceType", orgSourceType);
      formData.append("file", file);
      const response = await fetch("/api/org-memories", { method: "POST", body: formData });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        toast.error(data?.error || "Não foi possível criar memória.");
        return;
      }
    } else {
      const response = await fetch("/api/org-memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        toast.error(data?.error || "Não foi possível criar memória.");
        return;
      }
    }
    setOrgTitle("");
    setOrgContent("");
    setOrgUrl("");
    toast.success("Memória organizacional criada.");
    await refreshSettings();
  }

  async function deleteOrgMemory(id: string) {
    if (!window.confirm("Tem certeza que deseja excluir esta memória organizacional?")) return;
    await fetch(`/api/org-memories/${id}`, { method: "DELETE" });
    setOrgMemories((items) => items.filter((memory) => memory.id !== id));
  }

  async function saveBehaviorMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/behavior-memories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: behaviorEditId ?? undefined, content: behaviorContent }),
    });
    if (!response.ok) {
      toast.error("Não foi possível salvar comportamento.");
      return;
    }
    setBehaviorContent("");
    setBehaviorEditId(null);
    toast.success("Comportamento salvo.");
    await refreshSettings();
  }

  async function deleteBehaviorMemory(id: string) {
    if (!window.confirm("Tem certeza que deseja excluir esta diretriz de comportamento?")) return;
    await fetch(`/api/behavior-memories/${id}`, { method: "DELETE" });
    setBehaviorMemories((items) => items.filter((memory) => memory.id !== id));
  }

  function editBehaviorMemory(memory: BehaviorMemory) {
    setBehaviorEditId(memory.id);
    setBehaviorContent(memory.content);
  }

  function updateProvider(id: string, patch: Partial<ProviderDraft>) {
    setProviders((items) => items.map((provider) => (provider.id === id ? { ...provider, ...patch } : provider)));
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "soul", label: "Soul" },
    { id: "providers", label: "Provedores" },
    { id: "users", label: "Usuários" },
    { id: "memories", label: "Memórias" },
  ];

  return (
    <main className="min-h-screen bg-background px-4 py-6 md:px-8 md:py-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Configurações</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {tenant?.name ?? "Tenant"} · {user.role === "admin" ? "Administrador" : "Usuário"}
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex h-9 items-center justify-center rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Voltar ao chat
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border pb-px">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium transition-colors rounded-t-lg border border-b-0 -mb-px ${
                tab === t.id
                  ? "bg-card border-border text-foreground shadow-sm"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Soul tab */}
        {tab === "soul" && user.role === "admin" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Soul e comportamento</CardTitle>
              <CardDescription>Guia de comportamento do tenant e modelo padrão.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4" onSubmit={saveTenant}>
                <label className="grid gap-1.5 text-sm font-medium">
                  Soul
                  <textarea
                    value={soul}
                    onChange={(event) => setSoul(event.target.value)}
                    className="min-h-24 rounded-lg border border-input bg-background px-3 py-2 text-sm leading-6 outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Comportamento geral
                  <textarea
                    value={generalBehavior}
                    onChange={(event) => setGeneralBehavior(event.target.value)}
                    className="min-h-20 rounded-lg border border-input bg-background px-3 py-2 text-sm leading-6 outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Modelo padrão do tenant
                  <Select value={defaultProviderId} onValueChange={(value) => setDefaultProviderId(value || "none")}>
                    <SelectTrigger className="w-full md:w-[360px]">
                      <SelectValue placeholder="Modelo padrão">
                        {defaultProviderId !== "none" ? modelLabel(providers.find((p) => p.id === defaultProviderId) ?? null) : "Nenhum"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {providers.filter((provider) => provider.enabled).map((provider) => (
                        <SelectItem key={provider.id} value={provider.id}>
                          {modelLabel(provider)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <div>
                  <Button type="submit" size="sm">Salvar</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Providers tab */}
        {tab === "providers" && user.role === "admin" && (
          <div className="grid gap-4">
            {providers.map((provider) => (
              <div key={provider.id} className="grid gap-3 rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={provider.enabled ? "default" : "secondary"}>{provider.enabled ? "Ativo" : "Inativo"}</Badge>
                    <span className="text-sm font-medium">{providerKindLabels[provider.kind]}</span>
                    {provider.hasApiKey ? <span className="text-xs text-muted-foreground">Chave salva</span> : null}
                  </div>
                  <Button type="button" variant="destructive" size="sm" onClick={() => void deleteProvider(provider.id)}>
                    <Trash2 className="size-3.5" />
                    Excluir
                  </Button>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <Input value={provider.name} onChange={(event) => updateProvider(provider.id, { name: event.target.value })} placeholder="Nome" />
                  <Input value={provider.modelAlias ?? ""} onChange={(event) => updateProvider(provider.id, { modelAlias: event.target.value })} placeholder="Alias do modelo" />
                  <Input value={provider.endpointUrl ?? ""} onChange={(event) => updateProvider(provider.id, { endpointUrl: event.target.value })} placeholder="Endpoint URL" />
                  <div className="relative">
                    <Input
                      type={showKeys[provider.id] ? "text" : "password"}
                      value={provider.apiKey ?? ""}
                      onChange={(event) => updateProvider(provider.id, { apiKey: event.target.value })}
                      placeholder={provider.hasApiKey ? "Nova API key" : "API key"}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKeys((items) => ({ ...items, [provider.id]: !items[provider.id] }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                    >
                      {showKeys[provider.id] ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  {provider.kind === "ollama" && ollamaModels[provider.id]?.length ? (
                    <Select value={provider.model} onValueChange={(value) => updateProvider(provider.id, { model: value || provider.model })}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Modelo Ollama" />
                      </SelectTrigger>
                      <SelectContent>
                        {ollamaModels[provider.id].map((model) => (
                          <SelectItem key={model} value={model}>{model}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={provider.model} onChange={(event) => updateProvider(provider.id, { model: event.target.value })} placeholder="Modelo" />
                  )}
                  <Select value={provider.enabled ? "yes" : "no"} onValueChange={(value) => updateProvider(provider.id, { enabled: value === "yes" })}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Ativo</SelectItem>
                      <SelectItem value="no">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap gap-2">
                  {provider.kind === "ollama" ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => void fetchOllamaModels(provider)}>
                      Buscar modelos
                    </Button>
                  ) : null}
                  <Button type="button" size="sm" onClick={() => void saveProvider(provider)}>Salvar</Button>
                </div>
              </div>
            ))}

            <div className="grid gap-3 rounded-lg border border-dashed border-border bg-card/50 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Plus className="size-4" />
                Novo provedor
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <Select value={newProvider.kind} onValueChange={(value) => setNewProvider((item) => ({ ...item, kind: value as Provider["kind"] }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {providerKindLabels[newProvider.kind]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">Compatível OpenAI</SelectItem>
                    <SelectItem value="ollama">Ollama</SelectItem>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="anthropic">Anthropic</SelectItem>
                    <SelectItem value="google">Google</SelectItem>
                  </SelectContent>
                </Select>
                <Input value={newProvider.name} onChange={(event) => setNewProvider((item) => ({ ...item, name: event.target.value }))} placeholder="Nome" />
                <Input value={newProvider.endpointUrl ?? ""} onChange={(event) => setNewProvider((item) => ({ ...item, endpointUrl: event.target.value }))} placeholder="Endpoint URL" />
                <Input value={newProvider.apiKey ?? ""} onChange={(event) => setNewProvider((item) => ({ ...item, apiKey: event.target.value }))} placeholder="API key" />
                <Input value={newProvider.model} onChange={(event) => setNewProvider((item) => ({ ...item, model: event.target.value }))} placeholder="Modelo" />
                <Input value={newProvider.modelAlias ?? ""} onChange={(event) => setNewProvider((item) => ({ ...item, modelAlias: event.target.value }))} placeholder="Alias" />
              </div>
              <div>
                <Button type="button" size="sm" onClick={() => void saveProvider(newProvider)}>Adicionar</Button>
              </div>
            </div>
          </div>
        )}

        {/* Users tab */}
        {tab === "users" && user.role === "admin" && (
          <div className="grid gap-3">
            {users.map((item) => (
              <div key={item.id} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.email} · {item.role === "admin" ? "Administrador" : "Usuário"}</p>
                </div>
                <Select
                  defaultValue={item.modelOverrideProviderId ?? "none"}
                  onValueChange={(value) => void saveOverride(item.id, value || "none")}
                >
                  <SelectTrigger className="w-full md:w-[320px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Usar padrão do tenant</SelectItem>
                    {providers.filter((provider) => provider.enabled).map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>{modelLabel(provider)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}

        {/* Memories tab */}
        {tab === "memories" && (
          <div className="grid gap-6">
            {/* User memories */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Memórias do usuário</CardTitle>
                <CardDescription>Fatos, preferências e decisões pessoais.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <form className="flex flex-col gap-2 md:flex-row" onSubmit={saveUserMemory}>
                  <Select value={memoryType} onValueChange={(value) => setMemoryType(value as UserMemory["type"])}>
                    <SelectTrigger className="w-full md:w-[140px]">
                      <SelectValue>
                        {memoryType === "fact" ? "Fato" : memoryType === "preference" ? "Preferência" : "Decisão"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fact">Fato</SelectItem>
                      <SelectItem value="preference">Preferência</SelectItem>
                      <SelectItem value="decision">Decisão</SelectItem>
                    </SelectContent>
                  </Select>
                  {user.role === "admin" ? (
                    <Select value={memoryUserId} onValueChange={(value) => setMemoryUserId(value || user.id)}>
                      <SelectTrigger className="w-full md:w-[160px]">
                        <SelectValue>
                          {users.find((u) => u.id === memoryUserId)?.name ?? "Selecione"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {users.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : null}
                  <Input value={memoryContent} onChange={(event) => setMemoryContent(event.target.value)} placeholder="Conteúdo da memória" className="flex-1" />
                  <Button type="submit" size="sm">{memoryEditId ? "Atualizar" : "Salvar"}</Button>
                  {memoryEditId ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => { setMemoryEditId(null); setMemoryContent(""); setMemoryUserId(user.id); setMemoryType("fact"); }}>
                      Cancelar
                    </Button>
                  ) : null}
                </form>
                <div className="grid gap-2">
                  {userMemories.length ? userMemories.map((memory) => (
                    <div key={memory.id} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background/50 p-3">
                      <div className="min-w-0">
                        <p className="text-sm">{memory.content}</p>
                        <p className="text-xs text-muted-foreground">{memory.userName ? `${memory.userName} · ` : ""}{memory.type}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button type="button" variant="outline" size="sm" onClick={() => editUserMemory(memory)}>Editar</Button>
                        <Button type="button" variant="ghost" size="icon" onClick={() => void deleteUserMemory(memory.id)} aria-label="Excluir">
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  )) : <p className="text-sm text-muted-foreground">Nenhuma memória cadastrada.</p>}
                </div>
              </CardContent>
            </Card>

            {/* Org memories */}
            {user.role === "admin" && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">Memórias organizacionais</CardTitle>
                  <CardDescription>Documentos, links e referências do tenant.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <form className="grid gap-3" onSubmit={saveOrgMemory}>
                    <div className="grid gap-2 md:grid-cols-3">
                      <Input value={orgTitle} onChange={(e) => setOrgTitle(e.target.value)} placeholder="Título" required />
                      <Select value={orgSourceType} onValueChange={(value) => setOrgSourceType(value as "text" | "link" | "pdf" | "image")}>
                        <SelectTrigger className="w-full">
                          <SelectValue>
                            {orgSourceType === "text" ? "Texto" : orgSourceType === "link" ? "Link" : orgSourceType === "pdf" ? "PDF" : "Imagem"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Texto</SelectItem>
                          <SelectItem value="link">Link</SelectItem>
                          <SelectItem value="pdf">PDF</SelectItem>
                          <SelectItem value="image">Imagem</SelectItem>
                        </SelectContent>
                      </Select>
                      {orgSourceType === "link" ? (
                        <Input value={orgUrl} onChange={(e) => setOrgUrl(e.target.value)} placeholder="https://..." />
                      ) : orgSourceType === "pdf" || orgSourceType === "image" ? (
                        <Input type="file" accept={orgSourceType === "pdf" ? ".pdf" : "image/*"} />
                      ) : null}
                    </div>
                    {orgSourceType === "text" || orgSourceType === "link" ? (
                      <textarea
                        value={orgContent}
                        onChange={(e) => setOrgContent(e.target.value)}
                        placeholder={orgSourceType === "link" ? "Descrição ou resumo do link" : "Conteúdo"}
                        className="min-h-20 rounded-lg border border-input bg-background px-3 py-2 text-sm leading-6 outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                      />
                    ) : null}
                    <div>
                      <Button type="submit" size="sm">Criar memória</Button>
                    </div>
                  </form>
                  <div className="grid gap-2">
                    {orgMemories.length ? orgMemories.map((memory) => (
                      <div key={memory.id} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background/50 p-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{memory.title}</p>
                          <p className="text-xs text-muted-foreground">{memory.sourceType}{memory.tags ? ` · ${memory.tags}` : ""}</p>
                        </div>
                        <Button type="button" variant="ghost" size="icon" onClick={() => void deleteOrgMemory(memory.id)} aria-label="Excluir">
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    )) : <p className="text-sm text-muted-foreground">Nenhuma memória organizacional.</p>}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Behavior memories */}
            {user.role === "admin" && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">Comportamento</CardTitle>
                  <CardDescription>Diretrizes adicionais usadas no prompt do chat.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <form className="flex flex-col gap-2 md:flex-row" onSubmit={saveBehaviorMemory}>
                    <Input value={behaviorContent} onChange={(event) => setBehaviorContent(event.target.value)} placeholder="Nova diretriz" className="flex-1" />
                    <Button type="submit" size="sm">{behaviorEditId ? "Atualizar" : "Salvar"}</Button>
                    {behaviorEditId ? (
                      <Button type="button" variant="outline" size="sm" onClick={() => { setBehaviorEditId(null); setBehaviorContent(""); }}>
                        Cancelar
                      </Button>
                    ) : null}
                  </form>
                  <div className="grid gap-2">
                    {behaviorMemories.length ? behaviorMemories.map((memory) => (
                      <div key={memory.id} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background/50 p-3">
                        <div className="min-w-0">
                          <p className="text-sm">{memory.content}</p>
                          <p className="text-xs text-muted-foreground">{memory.summary}</p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button type="button" variant="outline" size="sm" onClick={() => editBehaviorMemory(memory)}>Editar</Button>
                          <Button type="button" variant="ghost" size="icon" onClick={() => void deleteBehaviorMemory(memory.id)} aria-label="Excluir">
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    )) : <p className="text-sm text-muted-foreground">Nenhuma diretriz cadastrada.</p>}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Non-admin sees only memories tab */}
        {tab !== "memories" && user.role !== "admin" && (
          <p className="text-sm text-muted-foreground">Você não tem permissão para acessar esta seção.</p>
        )}
      </div>
    </main>
  );
}

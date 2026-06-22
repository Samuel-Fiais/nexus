"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Menu, MessageSquare, Moon, Plus, Settings, Sun, X, LogOut } from "lucide-react";
import { AVAILABLE_PROVIDERS, type ProviderId } from "@/lib/ai/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type Conversation = {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
};

const CONV_STORAGE = "nexus.conversations";
const KEY_STORAGE = "nexus.providerKeys";
const URL_STORAGE = "nexus.providerUrls";

function createConversation(): Conversation {
  return {
    id: crypto.randomUUID(),
    title: "Nova conversa",
    messages: [],
    updatedAt: Date.now(),
  };
}

function getProviderKeys(): Partial<Record<ProviderId, string>> {
  if (typeof window === "undefined") return {};
  const stored = sessionStorage.getItem(KEY_STORAGE);
  return stored ? JSON.parse(stored) : {};
}

function getProviderUrls(): Partial<Record<ProviderId, string>> {
  if (typeof window === "undefined") return {};
  const stored = sessionStorage.getItem(URL_STORAGE);
  return stored ? JSON.parse(stored) : {};
}

function getConfiguredProviders(): ProviderId[] {
  const keys = getProviderKeys();
  const urls = getProviderUrls();
  return AVAILABLE_PROVIDERS.filter((p) => {
    const keyOk = !!keys[p.id];
    const urlOk = !p.requiresBaseUrl || !!urls[p.id];
    return keyOk && urlOk;
  }).map((p) => p.id);
}

function getInitialModel(providerId: ProviderId): string {
  const cfg = AVAILABLE_PROVIDERS.find((p) => p.id === providerId);
  if (cfg?.modelIsEditable) return "";
  return cfg?.models[0]?.id ?? "";
}

export function ChatWorkspace() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    if (typeof window === "undefined") return [];
    const stored = sessionStorage.getItem(CONV_STORAGE);
    const parsed = stored ? (JSON.parse(stored) as Conversation[]) : [];
    return parsed.length ? parsed : [createConversation()];
  });
  const [activeId, setActiveId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    const stored = sessionStorage.getItem(CONV_STORAGE);
    const parsed = stored ? (JSON.parse(stored) as Conversation[]) : [];
    const convs = parsed.length ? parsed : [createConversation()];
    return convs[0].id;
  });
  const [provider, setProvider] = useState<ProviderId | "">(() => {
    if (typeof window === "undefined") return "";
    const configured = getConfiguredProviders();
    return configured.length > 0 ? configured[0] : "";
  });
  const [model, setModel] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    const configured = getConfiguredProviders();
    return configured.length > 0 ? getInitialModel(configured[0]) : "";
  });
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Verificar login
  useEffect(() => {
    setMounted(true);
    if (!sessionStorage.getItem("nexus.user")) {
      router.replace("/login");
    }
  }, [router]);

  // Persistir conversas
  useEffect(() => {
    if (conversations.length) {
      sessionStorage.setItem(CONV_STORAGE, JSON.stringify(conversations));
    }
  }, [conversations]);

  const activeConversation = conversations.find((c) => c.id === activeId);
  const configuredProviders = getConfiguredProviders();
  const activeProvider = AVAILABLE_PROVIDERS.find((p) => p.id === provider);

  const sortedConversations = useMemo(
    () => [...conversations].sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations],
  );

  // Scroll automático
  const messageCount = activeConversation?.messages.length ?? 0;
  useEffect(() => {
    viewportRef.current?.scrollTo({
      top: viewportRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messageCount, isStreaming]);

  function resolveBaseUrlAndKey(selectedProvider: ProviderId) {
    const urls = getProviderUrls();
    const keys = getProviderKeys();
    const baseUrl = urls[selectedProvider];
    const apiKey = keys[selectedProvider];
    return { baseUrl, apiKey };
  }

  function isProviderReady(selectedProvider: ProviderId) {
    const cfg = AVAILABLE_PROVIDERS.find((p) => p.id === selectedProvider);
    if (!cfg) return false;
    const keys = getProviderKeys();
    const urls = getProviderUrls();
    const keyOk = !cfg.requiresKey || !!keys[selectedProvider];
    const urlOk = !cfg.requiresBaseUrl || !!urls[selectedProvider];
    return keyOk && urlOk;
  }

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = input.trim();
    if (!content || !activeConversation || isStreaming) return;

    if (!provider) {
      toast.error("Nenhum provedor selecionado. Configure uma chave em Configurações.");
      return;
    }

    if (!isProviderReady(provider)) {
      toast.error(`Configure a chave e URL do provedor ${activeProvider?.name ?? provider} em Configurações.`);
      return;
    }

    if (activeProvider?.modelIsEditable && !model.trim()) {
      toast.error("Informe o nome do modelo para este provedor.");
      return;
    }

    setInput("");
    setIsStreaming(true);

    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content };
    const assistantId = crypto.randomUUID();
    const title = activeConversation.messages.length === 0 ? content.slice(0, 48) : activeConversation.title;

    setConversations((items) =>
      items.map((item) =>
        item.id === activeId
          ? {
              ...item,
              title,
              updatedAt: Date.now(),
              messages: [...item.messages, userMessage, { id: assistantId, role: "assistant", content: "" }],
            }
          : item,
      ),
    );

    const { baseUrl, apiKey } = resolveBaseUrlAndKey(provider);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...activeConversation.messages, userMessage],
          provider,
          model,
          baseUrl,
          apiKey,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Erro desconhecido" }));
        throw new Error(err.error || `Erro ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error("Resposta vazia do servidor.");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        setConversations((items) =>
          items.map((item) =>
            item.id === activeId
              ? {
                  ...item,
                  updatedAt: Date.now(),
                  messages: item.messages.map((msg) =>
                    msg.id === assistantId ? { ...msg, content: msg.content + chunk } : msg,
                  ),
                }
              : item,
          ),
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar mensagem.");
      setConversations((items) =>
        items.map((item) =>
          item.id === activeId
            ? { ...item, messages: item.messages.filter((m) => m.id !== assistantId) }
            : item,
        ),
      );
    } finally {
      setIsStreaming(false);
    }
  }

  function newConversation() {
    const next = createConversation();
    setConversations((items) => [next, ...items]);
    setActiveId(next.id);
    setSheetOpen(false);
  }

  function selectConversation(id: string) {
    setActiveId(id);
    setSheetOpen(false);
  }

  function handleLogout() {
    sessionStorage.removeItem("nexus.user");
    router.replace("/login");
  }

  if (!mounted) return null;

  // Tela de boas-vindas se nenhum provider configurado
  if (configuredProviders.length === 0) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-8">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground shadow-lg">
          N
        </div>
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold text-foreground">Bem-vindo ao Nexus</h1>
          <p className="mt-2 text-muted-foreground">
            Nenhum provedor configurado. Acesse Configurações para adicionar suas chaves de API.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/settings"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
          >
            Configurações
          </Link>
          <Button variant="outline" onClick={handleLogout}>
            Sair
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-background">
      <section className="flex min-h-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border bg-background p-4">
          <div className="flex items-center gap-2">
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger>
                <Button type="button" variant="ghost" size="icon" aria-label="Abrir menu">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="gap-0 p-0">
                <div className="flex flex-col gap-4 p-4">
                  <SheetHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <SheetTitle>Nexus</SheetTitle>
                        <SheetDescription>Chat multi-provedor</SheetDescription>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Fechar menu"
                        onClick={() => setSheetOpen(false)}
                      >
                        <X className="size-5" />
                      </Button>
                    </div>
                  </SheetHeader>

                  <Button type="button" className="w-full" onClick={newConversation}>
                    <Plus className="size-4" />
                    Nova conversa
                  </Button>

                  <nav className="flex flex-col gap-1 text-sm">
                    <Link
                      href="/settings"
                      onClick={() => setSheetOpen(false)}
                      className="flex items-center gap-2 rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Settings className="size-4" />
                      Configurações
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setSheetOpen(false);
                        handleLogout();
                      }}
                      className="flex items-center gap-2 rounded-md px-3 py-2 text-left text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <LogOut className="size-4" />
                      Sair
                    </button>
                  </nav>

                  <Separator />

                  <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
                    <p className="px-3 text-xs font-medium text-muted-foreground">Conversas</p>
                    {sortedConversations.map((conversation) => (
                      <button
                        key={conversation.id}
                        type="button"
                        onClick={() => selectConversation(conversation.id)}
                        className={cn(
                          "rounded-md px-3 py-2 text-left text-sm transition-colors",
                          conversation.id === activeId
                            ? "bg-accent text-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                      >
                        <span className="block truncate font-medium">{conversation.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {conversation.messages.length} mensagens
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-foreground">
                {activeConversation?.title ?? "Chat"}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex gap-2">
              <Select
                value={provider}
                onValueChange={(value) => {
                  const nextProvider = value as ProviderId;
                  setProvider(nextProvider);
                  setModel(getInitialModel(nextProvider));
                }}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Provedor" />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_PROVIDERS.filter(
                    (p) => p.id === "custom" || configuredProviders.includes(p.id as ProviderId),
                  ).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {activeProvider?.modelIsEditable ? (
                <Input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="Nome do modelo"
                  className="w-[200px]"
                />
              ) : (
                activeProvider && (
                  <Select value={model} onValueChange={(v: string | null) => v && setModel(v)}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Modelo" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeProvider.models.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              )}
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </Button>
          </div>
        </header>

        <div ref={viewportRef} className="flex-1 overflow-y-auto bg-background p-4">
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {activeConversation?.messages.length ? (
              activeConversation.messages.map((message) => (
                <div
                  key={message.id}
                  className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
                >
                  {message.content ? (
                    <div
                      className={cn(
                        "max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm",
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground",
                      )}
                    >
                      {message.content}
                    </div>
                  ) : (
                    <div className="flex max-w-[80%] items-center gap-2 rounded-2xl bg-muted px-4 py-3">
                      <Skeleton className="h-4 w-4 rounded-full" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="flex min-h-[50vh] items-center justify-center">
                <div className="max-w-md text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                    <MessageSquare className="size-6 text-muted-foreground" />
                  </div>
                  <h2 className="text-xl font-semibold text-foreground">Comece uma conversa</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Escolha um provedor e modelo acima, depois digite sua mensagem.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <form onSubmit={submitMessage} className="border-t border-border bg-background p-4">
          <div className="mx-auto flex max-w-3xl gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Digite sua mensagem..."
              disabled={isStreaming}
              className="h-11"
            />
            <Button type="submit" disabled={!input.trim() || isStreaming} className="h-11 px-5">
              {isStreaming ? "Enviando..." : "Enviar"}
            </Button>
          </div>
        </form>
      </section>
    </main>
  );
}

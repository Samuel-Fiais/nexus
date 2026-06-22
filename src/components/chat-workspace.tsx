"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AVAILABLE_PROVIDERS, type ProviderId } from "@/lib/ai/config";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

function getConfiguredProviders(): ProviderId[] {
  const keys = getProviderKeys();
  const urls = typeof window !== "undefined" && sessionStorage.getItem("nexus.providerUrls")
    ? JSON.parse(sessionStorage.getItem("nexus.providerUrls")!)
    : {};
  return AVAILABLE_PROVIDERS
    .filter((p) => {
      if (p.id === "custom") return true;
      if (p.requiresBaseUrl) return urls[p.id];
      return keys[p.id];
    })
    .map((p) => p.id);
}

export function ChatWorkspace() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState("");
  const [provider, setProvider] = useState<ProviderId | "">("");
  const [model, setModel] = useState("");
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Inicialização após mount (acesso ao sessionStorage)
  useEffect(() => {
    setMounted(true);
    const stored = sessionStorage.getItem(CONV_STORAGE);
    const parsed = stored ? (JSON.parse(stored) as Conversation[]) : [];
    const convs = parsed.length ? parsed : [createConversation()];
    setConversations(convs);
    setActiveId(convs[0].id);

    // Provider padrão: primeiro configurado
    const configured = getConfiguredProviders();
    if (configured.length > 0) {
      setProvider(configured[0]);
      const cfg = AVAILABLE_PROVIDERS.find((p) => p.id === configured[0]);
      setModel(cfg?.models[0]?.id ?? "");
    }
  }, []);

  // Verificar login
  useEffect(() => {
    if (mounted && !sessionStorage.getItem("nexus.user")) {
      router.replace("/login");
    }
  }, [mounted, router]);

  // Persistir conversas
  useEffect(() => {
    if (conversations.length) {
      sessionStorage.setItem(CONV_STORAGE, JSON.stringify(conversations));
    }
  }, [conversations]);

  // Scroll automático
  useEffect(() => {
    viewportRef.current?.scrollTo({
      top: viewportRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [conversations.find((c) => c.id === activeId)?.messages.length, isStreaming]);

  const activeConversation = conversations.find((c) => c.id === activeId);
  const configuredProviders = getConfiguredProviders();
  const activeProvider = AVAILABLE_PROVIDERS.find((p) => p.id === provider);

  const sortedConversations = useMemo(
    () => [...conversations].sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations],
  );

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = input.trim();
    if (!content || !activeConversation || isStreaming) return;

    // Validar provider configurado
    if (!provider) {
      toast.error("Nenhum provedor selecionado. Configure uma chave em Configurações.");
      return;
    }
    const keys = getProviderKeys();
    if (provider !== "custom" && !keys[provider]) {
      toast.error(`Configure a chave do provedor ${activeProvider?.name ?? provider} em Configurações.`);
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

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...activeConversation.messages, userMessage],
          provider,
          model,
          baseUrl: (provider === 'ollama' || provider === 'custom')
            ? (sessionStorage.getItem('nexus.providerUrls')
              ? JSON.parse(sessionStorage.getItem('nexus.providerUrls')!)[provider]
              : undefined)
            : undefined,
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
      // Remove mensagem do assistente que falhou
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
  }

  function handleLogout() {
    sessionStorage.removeItem("nexus.user");
    router.replace("/login");
  }

  if (!mounted) return null;

  // Tela de boas-vindas se nenhum provider configurado
  if (configuredProviders.length === 0) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white p-8">
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
    <main className="grid min-h-screen grid-cols-1 bg-white lg:grid-cols-[280px_1fr]">
      {/* Sidebar */}
      <aside className="border-b border-slate-200 bg-slate-50/50 lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col gap-4 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-foreground">Nexus</h1>
              <p className="text-xs text-muted-foreground">Chat multi-provedor</p>
            </div>
            <Button type="button" variant="secondary" className="h-8 w-8" onClick={newConversation}>
              +
            </Button>
          </div>

          <nav className="flex flex-col gap-1 text-sm">
            <Link
              className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              href="/settings"
            >
              Configurações
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-md px-3 py-2 text-left text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Sair
            </button>
          </nav>

          <Separator />

          <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
            {sortedConversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => setActiveId(conversation.id)}
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
      </aside>

      {/* Chat */}
      <section className="flex min-h-0 flex-col">
        <header className="flex flex-col gap-3 border-b border-slate-200 bg-white p-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-foreground">
              {activeConversation?.title ?? "Chat"}
            </h2>
            <p className="text-sm text-muted-foreground">Histórico em memória da sessão atual</p>
          </div>

          <div className="flex gap-2 md:w-[420px]">
            <Select
              value={provider}
              onValueChange={(value) => {
                const nextProvider = value as ProviderId;
                const nextConfig = AVAILABLE_PROVIDERS.find((p) => p.id === nextProvider);
                setProvider(nextProvider);
                setModel(nextConfig?.models[0]?.id ?? "");
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione um provedor" />
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

            {activeProvider && (
              <Select value={model} onValueChange={(v: string | null) => v && setModel(v)}>
                <SelectTrigger className="w-full">
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
            )}
          </div>
        </header>

        <div ref={viewportRef} className="flex-1 overflow-y-auto bg-white p-4">
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
                          : "bg-slate-100 text-foreground",
                      )}
                    >
                      {message.content}
                    </div>
                  ) : (
                    <div className="flex max-w-[80%] items-center gap-2 rounded-2xl bg-slate-100 px-4 py-3">
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
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
                    <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
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

        <form onSubmit={submitMessage} className="border-t border-slate-200 bg-white p-4">
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

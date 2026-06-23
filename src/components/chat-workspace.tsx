"use client";

import { FormEvent, useMemo, useRef, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { LogOut, Menu, MessageSquare, Moon, Plus, SendHorizontal, Settings, Sun, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type User = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "user";
};

type Provider = {
  id: string;
  name: string;
  kind: "openai" | "anthropic" | "google" | "ollama" | "custom";
  model: string;
  modelAlias: string | null;
  enabled: boolean;
};

type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

type Message = {
  id: string;
  conversationId: string;
  role: "system" | "user" | "assistant";
  content: string;
  createdAt: string;
};

type ChatWorkspaceProps = {
  user: User;
  tenantName: string;
  providers: Provider[];
  resolvedProvider: Provider | null;
  conversations: Conversation[];
  initialConversationId: string;
  initialMessages: Message[];
};

function modelLabel(provider: Provider | null) {
  if (!provider) return "Sem modelo configurado";
  return `${provider.modelAlias || provider.name} / ${provider.model || "modelo não definido"}`;
}

export function ChatWorkspace({
  user,
  tenantName,
  providers,
  resolvedProvider,
  conversations: initialConversations,
  initialConversationId,
  initialMessages,
}: ChatWorkspaceProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [conversations, setConversations] = useState(initialConversations);
  const [activeId, setActiveId] = useState(initialConversationId);
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState(resolvedProvider?.id ?? providers.find((provider) => provider.enabled)?.id ?? "");
  const viewportRef = useRef<HTMLDivElement>(null);

  const activeConversation = conversations.find((conversation) => conversation.id === activeId) ?? null;
  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId) ?? resolvedProvider;
  const providerInfo = user.role === "admin" ? modelLabel(selectedProvider) : modelLabel(resolvedProvider);
  const visibleMessages = messages.filter((message) => message.role !== "system");

  const sortedConversations = useMemo(
    () => [...conversations].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [conversations],
  );

  useEffect(() => {
    viewportRef.current?.scrollTo({
      top: viewportRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, isStreaming]);

  async function loadConversation(id: string) {
    const response = await fetch(`/api/conversations/${id}`);
    if (!response.ok) {
      toast.error("Não foi possível carregar a conversa.");
      return;
    }
    const data = (await response.json()) as { messages: Message[] };
    setActiveId(id);
    setMessages(data.messages);
    setSheetOpen(false);
  }

  async function newConversation() {
    const response = await fetch("/api/conversations", { method: "POST" });
    if (!response.ok) {
      toast.error("Não foi possível criar a conversa.");
      return;
    }
    const data = (await response.json()) as { id: string };
    const now = new Date().toISOString();
    const conversation = { id: data.id, title: "Nova conversa", createdAt: now, updatedAt: now };
    setConversations((items) => [conversation, ...items]);
    setActiveId(data.id);
    setMessages([]);
    setSheetOpen(false);
  }

  async function deleteActiveConversation() {
    if (!activeId) return;
    const response = await fetch(`/api/conversations/${activeId}`, { method: "DELETE" });
    if (!response.ok) {
      toast.error("Não foi possível excluir a conversa.");
      return;
    }
    const remaining = conversations.filter((conversation) => conversation.id !== activeId);
    setConversations(remaining);
    setActiveId(remaining[0]?.id ?? "");
    if (remaining[0]) {
      await loadConversation(remaining[0].id);
    } else {
      setMessages([]);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = input.trim();
    if (!content || isStreaming) return;

    if (user.role === "admin" && !selectedProviderId) {
      toast.error("Selecione um provedor/modelo.");
      return;
    }

    setInput("");
    setIsStreaming(true);

    const localUserMessage: Message = {
      id: crypto.randomUUID(),
      conversationId: activeId,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    const assistantId = crypto.randomUUID();
    setMessages((items) => [
      ...items,
      localUserMessage,
      { ...localUserMessage, id: assistantId, role: "assistant", content: "" },
    ]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeId || undefined,
          content,
          providerId: user.role === "admin" ? selectedProviderId : undefined,
        }),
      });

      if (!response.ok) {
        const err = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error || `Erro ${response.status}`);
      }

      const conversationId = response.headers.get("x-conversation-id") || activeId;
      if (conversationId && conversationId !== activeId) {
        const now = new Date().toISOString();
        setActiveId(conversationId);
        setConversations((items) => [{ id: conversationId, title: content.slice(0, 60), createdAt: now, updatedAt: now }, ...items]);
      } else if (activeId) {
        setConversations((items) =>
          items.map((conversation) =>
            conversation.id === activeId
              ? { ...conversation, title: conversation.title === "Nova conversa" ? content.slice(0, 60) : conversation.title, updatedAt: new Date().toISOString() }
              : conversation,
          ),
        );
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Resposta vazia do servidor.");
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        setMessages((items) =>
          items.map((message) => (message.id === assistantId ? { ...message, content: message.content + chunk } : message)),
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar mensagem.");
      setMessages((items) => items.filter((message) => message.id !== assistantId));
    } finally {
      setIsStreaming(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <section className="flex min-h-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-background/90 px-4 py-3 backdrop-blur md:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger>
                <Button type="button" variant="ghost" size="icon" aria-label="Abrir menu" className="text-muted-foreground">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="gap-0 border-border/70 bg-sidebar p-0">
                <div className="flex h-full flex-col gap-5 p-5">
                  <SheetHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <SheetTitle className="font-heading text-2xl font-normal">Nexus</SheetTitle>
                        <SheetDescription className="text-muted-foreground">{tenantName}</SheetDescription>
                      </div>
                      <Button type="button" variant="ghost" size="icon" aria-label="Fechar menu" onClick={() => setSheetOpen(false)}>
                        <X className="size-5" />
                      </Button>
                    </div>
                  </SheetHeader>

                  <Button type="button" className="h-10 w-full shadow-sm" onClick={newConversation}>
                    <Plus className="size-4" />
                    Nova conversa
                  </Button>

                  <nav className="flex flex-col gap-1 text-sm">
                    <Link
                      href="/settings"
                      onClick={() => setSheetOpen(false)}
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Settings className="size-4" />
                      Configurações
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setSheetOpen(false);
                        void handleLogout();
                      }}
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <LogOut className="size-4" />
                      Sair
                    </button>
                  </nav>

                  <Separator />

                  <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
                    <p className="px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Conversas</p>
                    {sortedConversations.map((conversation) => (
                      <button
                        key={conversation.id}
                        type="button"
                        onClick={() => void loadConversation(conversation.id)}
                        className={cn(
                          "rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                          conversation.id === activeId ? "bg-accent text-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                      >
                        <span className="block truncate font-medium">{conversation.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(conversation.updatedAt).toLocaleString("pt-BR")}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            <div className="min-w-0">
              <h2 className="truncate font-heading text-xl font-normal leading-tight text-foreground">{activeConversation?.title ?? "Chat"}</h2>
              <p className="truncate text-xs text-muted-foreground">{user.name} · {providerInfo}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {user.role === "admin" ? (
              <Select value={selectedProviderId} onValueChange={(value) => setSelectedProviderId(value || "")}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Provedor/modelo">
                    {selectedProviderId ? modelLabel(providers.find((p) => p.id === selectedProviderId) ?? null) : "Provedor/modelo"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {providers
                    .filter((provider) => provider.enabled)
                    .map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {modelLabel(provider)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="hidden max-w-[280px] truncate rounded-full border border-border/80 bg-card/70 px-3 py-1.5 text-xs text-muted-foreground shadow-sm md:block">
                {providerInfo}
              </div>
            )}

            {activeId ? (
              <Button type="button" variant="ghost" size="icon" aria-label="Excluir conversa" onClick={() => void deleteActiveConversation()}>
                <Trash2 className="size-4" />
              </Button>
            ) : null}

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

        <div ref={viewportRef} className="flex-1 overflow-y-auto bg-background px-4 py-8 md:px-8">
          <div className="mx-auto flex max-w-3xl flex-col gap-7">
            {visibleMessages.length ? (
              visibleMessages.map((message) => (
                <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                  {message.content ? (
                    <div
                      className={cn(
                        "whitespace-pre-wrap text-[0.95rem] leading-7",
                        message.role === "user"
                          ? "max-w-[82%] rounded-2xl border border-primary/10 bg-primary px-4 py-3 text-primary-foreground shadow-sm"
                          : "max-w-full rounded-none px-1 py-1 text-foreground",
                      )}
                    >
                      {message.content}
                    </div>
                  ) : (
                    <div className="flex max-w-[80%] items-center gap-2 rounded-2xl border border-border/70 bg-card px-4 py-3 shadow-sm">
                      <Skeleton className="h-4 w-4 rounded-full" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="flex min-h-[58vh] items-center justify-center">
                <div className="max-w-xl text-center">
                  <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-border/70 bg-card shadow-sm">
                    <MessageSquare className="size-6 text-muted-foreground" />
                  </div>
                  <h2 className="font-heading text-4xl font-normal leading-tight text-foreground">Comece uma conversa</h2>
                  <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">Nexus está pronto para ler, escrever e consultar links em contexto.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <form onSubmit={submitMessage} className="border-t border-border/70 bg-background/95 px-4 py-4 backdrop-blur md:px-8">
          <div className="mx-auto flex max-w-3xl items-center gap-2 rounded-2xl border border-border/80 bg-card p-2 shadow-sm">
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Digite sua mensagem..."
              disabled={isStreaming}
              className="h-11 border-0 bg-transparent px-3 shadow-none focus-visible:ring-0"
            />
            <Button type="submit" disabled={!input.trim() || isStreaming} className="h-10 rounded-xl px-4 shadow-sm">
              {isStreaming ? "Enviando..." : <><SendHorizontal className="size-4" />Enviar</>}
            </Button>
          </div>
        </form>
      </section>
    </main>
  );
}

"use client";

import { FormEvent, useMemo, useRef, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Copy, LogOut, Menu, MessageSquare, Moon, Plus, SendHorizontal, Settings, Square, Sun, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
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

type TraceStep = {
  text: string;
  toolCalls: { name: string; args: Record<string, unknown>; result: string }[];
};

type TraceData = {
  steps: TraceStep[];
  sources: { number: number; type: string; content: string }[];
};

type Message = {
  id: string;
  conversationId: string;
  role: "system" | "user" | "assistant";
  content: string;
  createdAt: string;
  trace?: TraceData | null;
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

const STREAM_STATUS_PREFIX = "__STATUS__:processing\n";

function modelLabel(provider: Provider | null) {
  if (!provider) return "Sem modelo configurado";
  return `${provider.modelAlias || provider.name} / ${provider.model || "modelo não definido"}`;
}

function parseTraceContent(content: string): { content: string; trace: TraceData | null } {
  const marker = "\n\n__TRACE__\n";
  const start = content.indexOf(marker);
  if (start === -1) return { content, trace: null };

  const traceStart = start + marker.length;
  const end = content.indexOf("\n__ENDTRACE__", traceStart);
  if (end === -1) return { content, trace: null };

  try {
    const trace = JSON.parse(content.slice(traceStart, end)) as TraceData;
    return { content: content.slice(0, start), trace };
  } catch {
    return { content: content.slice(0, start), trace: null };
  }
}

function normalizeMessageTrace(message: Message): Message {
  if (message.trace !== undefined) return message;
  const parsed = parseTraceContent(message.content);
  return { ...message, content: parsed.content, trace: parsed.trace };
}

function stripStatusPrefix(text: string) {
  return text.startsWith(STREAM_STATUS_PREFIX) ? text.slice(STREAM_STATUS_PREFIX.length) : text;
}

function referenceMarkdown(content: string, messageId: string, sources: TraceData["sources"]) {
  if (!sources.length) return content;
  const sourceNumbers = new Set(sources.map((source) => source.number));
  return content.replace(/\[(\d+)\]/g, (match, value: string) => {
    const number = Number(value);
    return sourceNumbers.has(number) ? `[${match}](#fonte-${messageId}-${number})` : match;
  });
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="ml-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      aria-label={copied ? "Copiado" : "Copiar resposta"}
    >
      <Copy className="size-3.5" />
      {copied ? "Copiado" : "Copiar"}
    </button>
  );
}

function TraceView({
  trace,
  messageId,
  highlightedSource,
}: {
  trace: TraceData;
  messageId: string;
  highlightedSource: number | null;
}) {
  return (
    <div className="not-prose mt-4 space-y-4 border-t border-border/70 pt-3 text-xs text-muted-foreground">
      {trace.steps.length ? (
        <details className="group rounded-md border border-border/60 bg-muted/25 px-3 py-2">
          <summary className="cursor-pointer select-none font-medium text-muted-foreground transition-colors hover:text-foreground">
            🧠 Raciocínio
          </summary>
          <div className="mt-3 space-y-3">
            {trace.steps.map((step, index) => (
              <div key={`${messageId}-step-${index}`} className="space-y-2">
                <p className="font-medium text-foreground/80">Etapa {index + 1}</p>
                {step.text ? <p className="whitespace-pre-wrap leading-5">{step.text}</p> : <p className="italic">Sem texto nesta etapa.</p>}
                {step.toolCalls.map((toolCall, toolIndex) => (
                  <div key={`${messageId}-tool-${index}-${toolIndex}`} className="space-y-1">
                    <p className="font-medium text-foreground/80">Ferramenta: {toolCall.name}</p>
                    <pre className="overflow-x-auto rounded-md bg-background p-2 text-[0.72rem] leading-5 text-foreground/80">
                      {JSON.stringify({ argumentos: toolCall.args, resultado: toolCall.result }, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {trace.sources.length ? (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-foreground/80">📚 Fontes</h3>
          <ul className="space-y-1.5">
            {trace.sources.map((source) => (
              <li
                key={`${messageId}-source-${source.number}`}
                id={`fonte-${messageId}-${source.number}`}
                className={cn(
                  "rounded-md border border-border/60 bg-muted/20 px-2.5 py-2 transition-colors",
                  highlightedSource === source.number && "border-primary/50 bg-primary/10 text-foreground",
                )}
              >
                <span className="mr-1 font-medium text-foreground/80">[{source.number}]</span>
                <span className="mr-1">{source.type}:</span>
                <span>{source.content}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
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
  const [messages, setMessages] = useState(() => initialMessages.map(normalizeMessageTrace));
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [highlightedSource, setHighlightedSource] = useState<number | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState(resolvedProvider?.id ?? providers.find((provider) => provider.enabled)?.id ?? "");
  const viewportRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, 44), 240);
    textarea.style.height = `${nextHeight}px`;
  }, [input]);

  async function loadConversation(id: string) {
    const response = await fetch(`/api/conversations/${id}`);
    if (!response.ok) {
      toast.error("Não foi possível carregar a conversa.");
      return;
    }
    const data = (await response.json()) as { messages: Message[] };
    setActiveId(id);
    setMessages(data.messages.map(normalizeMessageTrace));
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
    if (!window.confirm("Tem certeza que deseja excluir esta conversa?")) return;
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

  function stopStreaming() {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  async function submitMessage(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const content = input.trim();
    if (!content || isStreaming) return;

    if (user.role === "admin" && !selectedProviderId) {
      toast.error("Selecione um provedor/modelo.");
      return;
    }

    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "44px";
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

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeId || undefined,
          content,
          providerId: user.role === "admin" ? selectedProviderId : undefined,
        }),
        signal: controller.signal,
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
      let assistantContent = "";
      let statusStripped = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        assistantContent += chunk;

        let displayChunk = chunk;
        if (!statusStripped) {
          const stripped = stripStatusPrefix(assistantContent);
          if (stripped.length < assistantContent.length) {
            statusStripped = true;
            displayChunk = stripped.slice(assistantContent.length - chunk.length);
            assistantContent = stripped;
          }
        }

        if (displayChunk) {
          setMessages((items) =>
            items.map((message) => (message.id === assistantId ? { ...message, content: message.content + displayChunk } : message)),
          );
        }
      }

      const finalChunk = decoder.decode();
      if (finalChunk) assistantContent += finalChunk;

      const parsed = parseTraceContent(assistantContent);
      setMessages((items) =>
        items.map((message) => (message.id === assistantId ? { ...message, content: parsed.content, trace: parsed.trace } : message)),
      );
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setMessages((items) => items.filter((message) => message.id !== assistantId));
      } else {
        toast.error(err instanceof Error ? err.message : "Erro ao enviar mensagem.");
        setMessages((items) => items.filter((message) => message.id !== assistantId));
      }
    } finally {
      abortControllerRef.current = null;
      setIsStreaming(false);
    }
  }

  function handleTextareaKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitMessage();
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
                        "prose prose-sm dark:prose-invert max-w-none text-[0.95rem] leading-7",
                        message.role === "user"
                          ? "max-w-[82%] rounded-2xl border border-primary/10 bg-primary px-4 py-3 text-primary-foreground shadow-sm"
                          : "max-w-full rounded-none px-1 py-1 text-foreground",
                      )}
                    >
                      {message.role === "assistant" ? (
                        <>
                          <div className="mb-1 flex items-center justify-end">
                            <CopyButton text={message.content} />
                          </div>
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              a({ href, children, ...props }) {
                                const match = href?.match(/^#fonte-.+-(\d+)$/);
                                if (!match) return <a href={href} {...props}>{children}</a>;
                                const sourceHref = href ?? "";
                                const sourceNumber = Number(match[1]);
                                return (
                                  <a
                                    href={sourceHref}
                                    className="align-super text-[0.7em] font-semibold no-underline hover:underline"
                                    onClick={(event) => {
                                      event.preventDefault();
                                      setHighlightedSource(sourceNumber);
                                      document.querySelector(sourceHref)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
                                    }}
                                    onMouseEnter={() => setHighlightedSource(sourceNumber)}
                                    onMouseLeave={() => setHighlightedSource(null)}
                                  >
                                    {children}
                                  </a>
                                );
                              },
                            } satisfies Components}
                          >
                            {referenceMarkdown(message.content, message.id, message.trace?.sources ?? [])}
                          </ReactMarkdown>
                          {message.trace ? (
                            <TraceView
                              trace={message.trace}
                              messageId={message.id}
                              highlightedSource={highlightedSource}
                            />
                          ) : null}
                        </>
                      ) : (
                        message.content
                      )}
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
          <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-border/80 bg-card p-2 shadow-sm">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleTextareaKeyDown}
              placeholder="Digite sua mensagem..."
              disabled={isStreaming}
              rows={1}
              className="min-h-[44px] w-full resize-none border-0 bg-transparent px-3 py-2.5 text-[0.95rem] leading-6 shadow-none outline-none focus-visible:ring-0"
            />
            {isStreaming ? (
              <Button type="button" onClick={stopStreaming} className="h-10 rounded-xl px-4 shadow-sm">
                <Square className="size-4 fill-current" />
                Parar
              </Button>
            ) : (
              <Button type="submit" disabled={!input.trim()} className="h-10 rounded-xl px-4 shadow-sm">
                <SendHorizontal className="size-4" />
                Enviar
              </Button>
            )}
          </div>
        </form>
      </section>
    </main>
  );
}

"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AVAILABLE_PROVIDERS, type ProviderId } from "@/lib/ai/config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
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

const STORAGE_KEY = "nexus.conversations";
const KEY_STORAGE = "nexus.providerKeys";

function createConversation(): Conversation {
  return {
    id: crypto.randomUUID(),
    title: "Nova conversa",
    messages: [],
    updatedAt: Date.now(),
  };
}

export function ChatWorkspace() {
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }

    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed = stored ? (JSON.parse(stored) as Conversation[]) : [];
    return parsed.length ? parsed : [createConversation()];
  });
  const [activeId, setActiveId] = useState(() => conversations[0]?.id ?? "");
  const [provider, setProvider] = useState<ProviderId>("openai");
  const [model, setModel] = useState(AVAILABLE_PROVIDERS[0]?.models[0]?.id ?? "");
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);

  const activeProvider = AVAILABLE_PROVIDERS.find((item) => item.id === provider) ?? AVAILABLE_PROVIDERS[0];
  const activeConversation = conversations.find((item) => item.id === activeId);
  const configuredProviders = useConfiguredProviders();

  useEffect(() => {
    if (conversations.length) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    }
  }, [conversations]);

  useEffect(() => {
    viewportRef.current?.scrollTo({
      top: viewportRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [activeConversation?.messages.length, isStreaming]);

  const sortedConversations = useMemo(
    () => [...conversations].sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations],
  );

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = input.trim();
    if (!content || !activeConversation || isStreaming) {
      return;
    }

    setInput("");
    setIsStreaming(true);

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
    };

    const assistantId = crypto.randomUUID();
    const title = activeConversation.messages.length === 0 ? content.slice(0, 48) : activeConversation.title;

    setConversations((items) =>
      items.map((item) =>
        item.id === activeId
          ? {
              ...item,
              title,
              updatedAt: Date.now(),
              messages: [
                ...item.messages,
                userMessage,
                { id: assistantId, role: "assistant", content: "" },
              ],
            }
          : item,
      ),
    );

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [...activeConversation.messages, userMessage],
        provider,
        model,
      }),
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      setIsStreaming(false);
      return;
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const chunk = decoder.decode(value);
      setConversations((items) =>
        items.map((item) =>
          item.id === activeId
            ? {
                ...item,
                updatedAt: Date.now(),
                messages: item.messages.map((message) =>
                  message.id === assistantId
                    ? { ...message, content: message.content + chunk }
                    : message,
                ),
              }
            : item,
        ),
      );
    }

    setIsStreaming(false);
  }

  function newConversation() {
    const next = createConversation();
    setConversations((items) => [next, ...items]);
    setActiveId(next.id);
  }

  return (
    <main className="grid min-h-screen grid-cols-1 bg-background text-foreground lg:grid-cols-[280px_1fr]">
      <aside className="border-b border-border bg-muted/30 lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col gap-4 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold">Nexus</h1>
              <p className="text-sm text-muted-foreground">Chat IA multi-provedor</p>
            </div>
            <Button type="button" variant="secondary" className="h-9 px-3" onClick={newConversation}>
              +
            </Button>
          </div>

          <nav className="flex gap-2 text-sm lg:flex-col">
            <Link className="rounded-md px-3 py-2 text-muted-foreground hover:bg-accent hover:text-foreground" href="/login">
              Login
            </Link>
            <Link className="rounded-md px-3 py-2 text-muted-foreground hover:bg-accent hover:text-foreground" href="/settings">
              Configuracoes
            </Link>
          </nav>

          <Separator />

          <div className="flex gap-2 overflow-x-auto lg:flex-1 lg:flex-col lg:overflow-y-auto">
            {sortedConversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => setActiveId(conversation.id)}
                className={cn(
                  "min-w-56 rounded-md px-3 py-2 text-left text-sm transition-colors lg:min-w-0",
                  conversation.id === activeId
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <span className="line-clamp-1 block font-medium">{conversation.title}</span>
                <span className="text-xs text-muted-foreground">
                  {conversation.messages.length} mensagens
                </span>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <section className="flex min-h-0 flex-col">
        <header className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">{activeConversation?.title ?? "Chat"}</h2>
              <Badge>{configuredProviders.has(provider) || provider === "custom" ? "configurado" : "sem chave"}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">Historico em memoria da sessao atual</p>
          </div>

          <div className="grid grid-cols-2 gap-2 md:w-[420px]">
            <Select
              value={provider}
              onChange={(event) => {
                const nextProvider = event.target.value as ProviderId;
                const nextConfig = AVAILABLE_PROVIDERS.find((item) => item.id === nextProvider);
                setProvider(nextProvider);
                setModel(nextConfig?.models[0]?.id ?? "");
              }}
            >
              {AVAILABLE_PROVIDERS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
            <Select value={model} onChange={(event) => setModel(event.target.value)}>
              {activeProvider?.models.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </div>
        </header>

        <div ref={viewportRef} className="flex-1 overflow-y-auto p-4">
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {activeConversation?.messages.length ? (
              activeConversation.messages.map((message) => (
                <div
                  key={message.id}
                  className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
                >
                  <Card
                    className={cn(
                      "max-w-[85%] px-4 py-3 text-sm leading-6",
                      message.role === "user" ? "bg-primary text-primary-foreground" : "bg-card",
                    )}
                  >
                    {message.content || "Digitando..."}
                  </Card>
                </div>
              ))
            ) : (
              <div className="flex min-h-[50vh] items-center justify-center">
                <div className="max-w-md text-center">
                  <h2 className="text-2xl font-semibold">Comece uma conversa</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Escolha o provedor, selecione um modelo e envie a primeira mensagem.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <form onSubmit={submitMessage} className="border-t border-border p-4">
          <div className="mx-auto flex max-w-3xl gap-2">
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Digite sua mensagem..."
              disabled={isStreaming}
            />
            <Button type="submit" disabled={!input.trim() || isStreaming}>
              Enviar
            </Button>
          </div>
        </form>
      </section>
    </main>
  );
}

function useConfiguredProviders() {
  const [configured] = useState<Set<ProviderId>>(() => {
    if (typeof window === "undefined") {
      return new Set();
    }

    const stored = window.sessionStorage.getItem(KEY_STORAGE);
    const parsed = stored ? (JSON.parse(stored) as Partial<Record<ProviderId, string>>) : {};
    return new Set(
      Object.entries(parsed)
        .filter(([, value]) => Boolean(value))
        .map(([key]) => key as ProviderId),
    );
  });

  return configured;
}

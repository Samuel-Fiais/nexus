"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { AVAILABLE_PROVIDERS, type ProviderId } from "@/lib/ai/config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";

const KEY_STORAGE = "nexus.providerKeys";
const URL_STORAGE = "nexus.providerUrls";

export function SettingsForm() {
  const [keys, setKeys] = useState<Partial<Record<ProviderId, string>>>(() => {
    if (typeof window === "undefined") return {};
    const stored = sessionStorage.getItem(KEY_STORAGE);
    return stored ? JSON.parse(stored) : {};
  });
  const [urls, setUrls] = useState<Partial<Record<ProviderId, string>>>(() => {
    if (typeof window === "undefined") return {};
    const stored = sessionStorage.getItem(URL_STORAGE);
    return stored ? JSON.parse(stored) : {};
  });
  const [showKeys, setShowKeys] = useState<Partial<Record<ProviderId, boolean>>>({});

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sessionStorage.setItem(KEY_STORAGE, JSON.stringify(keys));
    sessionStorage.setItem(URL_STORAGE, JSON.stringify(urls));
    toast.success("Chaves salvas na sessão.");
  }

  function toggleShow(providerId: ProviderId) {
    setShowKeys((prev) => ({ ...prev, [providerId]: !prev[providerId] }));
  }

  return (
    <main className="min-h-screen bg-white p-4 md:p-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Configurações</h1>
            <p className="text-sm text-muted-foreground">
              Chaves guardadas apenas na sessão atual (sessionStorage).
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-transparent px-4 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Voltar ao chat
          </Link>
        </div>

        <form className="flex flex-col gap-4" onSubmit={submit}>
          {AVAILABLE_PROVIDERS.map((provider) => {
            const isConfigured = !!(keys[provider.id] || !provider.requiresKey) && (!provider.requiresBaseUrl || urls[provider.id]);

            return (
              <Card key={provider.id} className="border-slate-200">
                <CardHeader className="flex-row items-start justify-between">
                  <div>
                    <CardTitle className="text-foreground">{provider.name}</CardTitle>
                    <CardDescription>
                      {provider.id === "ollama"
                        ? "Modelos locais via Ollama. Informe a URL do servidor."
                        : provider.id === "custom"
                          ? "Provedor compatível com OpenAI. Informe a URL base."
                          : "Chave usada para chamadas ao provedor selecionado."}
                    </CardDescription>
                  </div>
                  <Badge className={isConfigured ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}>
                    {isConfigured ? "Configurado" : "Pendente"}
                  </Badge>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {provider.requiresKey && (
                    <div className="relative">
                      <Input
                        type={showKeys[provider.id] ? "text" : "password"}
                        value={keys[provider.id] ?? ""}
                        onChange={(e) => setKeys((prev) => ({ ...prev, [provider.id]: e.target.value }))}
                        placeholder="API key"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => toggleShow(provider.id)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground hover:text-foreground"
                        tabIndex={-1}
                      >
                        {showKeys[provider.id] ? "🙈" : "👁"}
                      </button>
                    </div>
                  )}
                  {provider.requiresBaseUrl && (
                    <Input
                      value={urls[provider.id] ?? ""}
                      onChange={(e) => setUrls((prev) => ({ ...prev, [provider.id]: e.target.value }))}
                      placeholder={provider.baseUrlPlaceholder ?? "http://localhost:11434/v1"}
                    />
                  )}
                </CardContent>
              </Card>
            );
          })}

          <div className="flex items-center justify-end gap-3">
            <Button type="submit" className="px-6">
              Salvar
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}

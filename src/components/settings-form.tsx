"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { AVAILABLE_PROVIDERS, type ProviderId } from "@/lib/ai/config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const STORAGE_KEY = "nexus.providerKeys";

export function SettingsForm() {
  const [keys, setKeys] = useState<Partial<Record<ProviderId, string>>>(() => {
    if (typeof window === "undefined") {
      return {};
    }

    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as Partial<Record<ProviderId, string>>) : {};
  });
  const [saved, setSaved] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Configuracoes</h1>
            <p className="text-sm text-muted-foreground">Chaves guardadas apenas em sessionStorage.</p>
          </div>
          <Button type="button" variant="secondary" onClick={() => (window.location.href = "/")}>
            Voltar
          </Button>
        </div>

        <form className="flex flex-col gap-4" onSubmit={submit}>
          {AVAILABLE_PROVIDERS.map((provider) => (
            <Card key={provider.id}>
              <CardHeader className="flex-row items-start justify-between">
                <div>
                  <CardTitle>{provider.name}</CardTitle>
                  <CardDescription>
                    {provider.id === "custom"
                      ? "Provider OpenAI-compatible configurado por sessao."
                      : "Chave usada para chamadas ao provedor selecionado."}
                  </CardDescription>
                </div>
                <Badge>{keys[provider.id] || !provider.requiresKey ? "configurado" : "pendente"}</Badge>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Input
                  type="password"
                  value={keys[provider.id] ?? ""}
                  onChange={(event) =>
                    setKeys((current) => ({ ...current, [provider.id]: event.target.value }))
                  }
                  placeholder={provider.requiresKey ? "API key" : "API key opcional"}
                />
                {provider.id === "custom" ? <Input placeholder="Base URL (ex.: http://localhost:11434/v1)" /> : null}
              </CardContent>
            </Card>
          ))}

          <div className="flex items-center justify-between">
            <Link className="text-sm text-muted-foreground hover:text-foreground" href="/">
              Chat
            </Link>
            <div className="flex items-center gap-3">
              {saved ? <span className="text-sm text-muted-foreground">Salvo na sessao</span> : null}
              <Button type="submit">Salvar</Button>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}

"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!email.includes("@")) {
      setError("Informe um e-mail válido.");
      return;
    }

    sessionStorage.setItem(
      "nexus.user",
      JSON.stringify({
        id: crypto.randomUUID(),
        email,
        name: email.split("@")[0],
      }),
    );

    router.replace("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white p-4">
      <Card className="w-full max-w-md border-slate-200 shadow-xl shadow-slate-200/60">
        <CardHeader className="items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground shadow-sm">
            N
          </div>
          <div>
            <CardTitle className="text-2xl text-foreground">Nexus</CardTitle>
            <CardDescription>Acesse seu workspace de conversas.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="voce@empresa.com"
              autoComplete="email"
              className="h-11"
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="h-11">
              Entrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

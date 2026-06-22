"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!email.includes("@")) {
      setError("Informe um email valido.");
      return;
    }

    sessionStorage.setItem("nexus.user", JSON.stringify({ id: "1", email, name: email.split("@")[0] }));
    window.location.href = "/";
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Entrar no Nexus</CardTitle>
          <CardDescription>Login demo por email, sem banco de dados.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="voce@empresa.com"
              autoComplete="email"
            />
            {error ? <p className="text-sm text-red-400">{error}</p> : null}
            <Button type="submit">Entrar</Button>
            <Link className="text-center text-sm text-muted-foreground hover:text-foreground" href="/">
              Voltar ao chat
            </Link>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

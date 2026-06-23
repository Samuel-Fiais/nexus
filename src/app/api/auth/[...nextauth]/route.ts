import { getCurrentUser, signInWithEmail, signOut } from "@/lib/auth";
import { jsonError, readJson } from "@/lib/api";

export const runtime = "nodejs";

type AuthBody = {
  email?: string;
  password?: string;
};

function actionFromUrl(request: Request) {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  return parts[2] ?? "me";
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  const action = actionFromUrl(request);

  if (action === "me" || action === "[...nextauth]") {
    return Response.json({ user });
  }

  return Response.json({ status: "ok", user });
}

export async function POST(request: Request) {
  const action = actionFromUrl(request);

  if (action === "logout") {
    await signOut();
    return Response.json({ ok: true });
  }

  if (action === "login") {
    const body = await readJson<AuthBody>(request);
    const email = body?.email?.trim();
    const password = body?.password ?? "";
    if (!email || !email.includes("@")) return jsonError("Informe um e-mail válido.");
    if (!password) return jsonError("Informe a senha.");

    const user = await signInWithEmail(email, password);
    if (!user) return jsonError("E-mail ou senha inválidos.", 401);
    return Response.json({ user });
  }

  return jsonError("Ação de autenticação inválida.", 404);
}

import { requireUser } from "@/lib/auth";
import { createConversation, listConversations } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireUser();
  return Response.json({ conversations: listConversations(user) });
}

export async function POST() {
  const user = await requireUser();
  const id = createConversation(user);
  return Response.json({ id });
}

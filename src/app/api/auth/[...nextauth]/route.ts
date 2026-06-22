export async function GET() {
  return Response.json({
    status: "unavailable",
    reason: "next-auth nao esta instalado neste ambiente sem acesso ao registry npm.",
  });
}

export async function POST() {
  return Response.json({
    status: "unavailable",
    reason: "next-auth nao esta instalado neste ambiente sem acesso ao registry npm.",
  });
}

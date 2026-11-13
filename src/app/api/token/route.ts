// Emite un token temporal de AssemblyAI para que el navegador abra la
// transcripción en vivo sin conocer la clave real.
export const dynamic = "force-dynamic";

export async function POST() {
  const key = process.env.ASSEMBLYAI_API_KEY;
  if (!key) return Response.json({ error: "Falta ASSEMBLYAI_API_KEY" }, { status: 500 });
  const res = await fetch("https://token.assemblyai.com/v1/token", {
    method: "POST",
    headers: { Authorization: key, "Content-Type": "application/json" },
    body: JSON.stringify({ product: "streaming", expires_in_seconds: 60 }),
  });
  if (!res.ok) return Response.json({ error: `AssemblyAI ${res.status}` }, { status: 502 });
  const { token } = (await res.json()) as { token: string };
  return Response.json({ token });
}

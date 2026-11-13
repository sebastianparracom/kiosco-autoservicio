// Interpreta un fragmento de frase con Jev. Las preguntas se construyen aquí,
// en el servidor, así que el navegador no puede usar esta ruta para otra cosa.
import { interpretClause, type InterpretRequest } from "@/lib/jev";
import { PRODUCT_BY_ID } from "@/lib/menu";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const key = process.env.OPENROUTER_API_KEY;
  const model = process.env.JEV_MODEL || "~typesafe/jev-latest";
  if (!key) return Response.json({ error: "Falta OPENROUTER_API_KEY" }, { status: 500 });

  const body = (await request.json().catch(() => null)) as InterpretRequest | null;
  const valid =
    body &&
    typeof body.fragment === "string" &&
    body.fragment.length <= 300 &&
    typeof body.before === "string" &&
    body.before.length <= 600 &&
    Array.isArray(body.lines) &&
    body.lines.length <= 8 &&
    body.lines.every((l) => l && PRODUCT_BY_ID[l.product]) &&
    Array.isArray(body.focus) &&
    (body.lang === "es" || body.lang === "en");
  if (!valid) return Response.json({ error: "Solicitud inválida" }, { status: 400 });

  try {
    return Response.json(await interpretClause(body, key, model));
  } catch (e) {
    return Response.json({ error: String(e).slice(0, 200) }, { status: 502 });
  }
}

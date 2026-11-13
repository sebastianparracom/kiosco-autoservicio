// Genera las imágenes de cada bebida (y su variación fría/caliente) con Fal.
// Uso: npm run images            → genera solo las que faltan
//      npm run images -- latte   → regenera las de un producto
import fs from "node:fs";
import path from "node:path";
import { PRODUCTS } from "../src/lib/menu";

const MODEL = "bytedance/seedream/v5.5/text-to-image";
const OUT = path.join(process.cwd(), "public", "drinks");
const key = process.env.FAL_KEY;
if (!key) throw new Error("Falta FAL_KEY en .env");
const only = process.argv.slice(2);

const prompt = (visual: string) =>
  `Professional studio product photograph of ${visual}. Exactly one drink, centered, whole glass fully visible with margin around it, ` +
  `eye-level front view from a slight elevation, soft even daylight, photorealistic, crisp detail, natural appetizing colors. ` +
  `Isolated cutout on a fully transparent background, no table, no surface, no shadow on the ground, no saucer, no spoon, no text, no logo, no hands.`;

async function generate(visual: string): Promise<Buffer> {
  const headers = { Authorization: `Key ${key}`, "Content-Type": "application/json" };
  const submit = await fetch(`https://queue.fal.run/${MODEL}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      prompt: prompt(visual),
      image_size: "square_hd",
      background: "transparent",
      output_format: "png",
      num_images: 1,
    }),
  });
  if (!submit.ok) throw new Error(`Fal ${submit.status}: ${(await submit.text()).slice(0, 300)}`);
  const job = (await submit.json()) as { status_url: string; response_url: string };
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const st = (await (await fetch(job.status_url, { headers })).json()) as { status: string };
    if (st.status === "COMPLETED") break;
    if (st.status !== "IN_QUEUE" && st.status !== "IN_PROGRESS") throw new Error(`Fal estado ${JSON.stringify(st).slice(0, 300)}`);
  }
  const res = (await (await fetch(job.response_url, { headers })).json()) as { images?: { url: string }[] };
  const url = res.images?.[0]?.url;
  if (!url) throw new Error(`Fal sin imagen: ${JSON.stringify(res).slice(0, 300)}`);
  return Buffer.from(await (await fetch(url)).arrayBuffer());
}

const jobs: { file: string; visual: string }[] = [];
for (const p of PRODUCTS) {
  if (only.length && !only.includes(p.id)) continue;
  for (const temp of p.temps) {
    const file = path.join(OUT, `${p.id}-${temp}.png`);
    if (!only.length && fs.existsSync(file)) continue;
    jobs.push({ file, visual: p.visual[temp]! });
  }
}

fs.mkdirSync(OUT, { recursive: true });
console.log(`Generando ${jobs.length} imágenes…`);
const results = await Promise.allSettled(
  jobs.map(async (j) => {
    const buf = await generate(j.visual);
    fs.writeFileSync(j.file, buf);
    console.log(`ok  ${path.basename(j.file)} (${Math.round(buf.length / 1024)} KB)`);
  }),
);
const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
for (const f of failed) console.log("ERROR", String(f.reason).slice(0, 300));
console.log(`Listo: ${jobs.length - failed.length}/${jobs.length}`);

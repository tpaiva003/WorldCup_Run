/**
 * Trionda trigger — Cloudflare Worker (grátis).
 *
 * Dispara o workflow "Atualizar dados do desafio" no GitHub, para o botão
 * da bola no site poder forçar uma atualização nova (golos + folha) na hora.
 *
 * Porque é preciso: uma página estática não pode guardar o token do GitHub
 * em segurança. Este Worker guarda-o (como "secret") e só expõe um endpoint
 * que arranca a Action.
 *
 * --- Como pôr a funcionar (uma vez) ---
 * 1. Cria um token no GitHub:
 *      Settings → Developer settings → Fine-grained tokens → Generate
 *      - Repository access: só o repo WorldCup_Run
 *      - Permissions: Actions = Read and write
 * 2. Em Cloudflare (dash.cloudflare.com) → Workers & Pages → Create → Worker:
 *      - cola este ficheiro
 *      - Settings → Variables → adiciona um *Secret* GH_TOKEN = <o token>
 *      - (opcional) Variables: GH_OWNER, GH_REPO, GH_WORKFLOW, GH_REF
 *      - Deploy
 * 3. Copia o URL do Worker (ex.: https://trionda.<conta>.workers.dev) e
 *    cola-o em assets/trigger-config.js (TRIONDA_TRIGGER_URL).
 */

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }
    if (request.method !== "POST") {
      return json({ ok: false, error: "Usa POST" }, 405, cors);
    }
    if (!env.GH_TOKEN) {
      return json({ ok: false, error: "Falta o secret GH_TOKEN" }, 500, cors);
    }

    const owner = env.GH_OWNER || "tpaiva003";
    const repo = env.GH_REPO || "WorldCup_Run";
    const workflow = env.GH_WORKFLOW || "update-data.yml";
    const ref = env.GH_REF || "main";

    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.GH_TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "trionda-trigger",
        },
        body: JSON.stringify({ ref }),
      }
    );

    if (res.status === 204) return json({ ok: true }, 200, cors);
    const detail = await res.text();
    return json({ ok: false, status: res.status, detail }, 502, cors);
  },
};

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

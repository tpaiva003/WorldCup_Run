#!/usr/bin/env node
/**
 * Atualiza data/data.json com:
 *   - número de golos do Mundial (API pública da ESPN)
 *   - km corridos por cada atleta (Google Sheets, exportado em CSV)
 *
 * Sem dependências externas: corre em Node 18+ (fetch nativo).
 * É idempotente — recalcula tudo do zero a cada execução.
 * Se uma fonte falhar, mantém o valor anterior e regista o erro,
 * para nunca apagar o painel por causa de uma falha temporária.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CONFIG_PATH = resolve(ROOT, "config.json");
const DATA_PATH = resolve(ROOT, "data/data.json");

const log = (...a) => console.log("[update-data]", ...a);
const warn = (...a) => console.warn("[update-data] AVISO:", ...a);

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

/* ------------------------------------------------------------------ */
/* Golos — API pública da ESPN (sem chave)                            */
/* ------------------------------------------------------------------ */

function ymd(date) {
  return (
    date.getUTCFullYear().toString() +
    String(date.getUTCMonth() + 1).padStart(2, "0") +
    String(date.getUTCDate()).padStart(2, "0")
  );
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "um-golo-um-km/1.0 (+github actions)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return res.json();
}

async function fetchGoals(competition) {
  const league = competition.espnLeague;
  const start = new Date(competition.startDate + "T00:00:00Z");
  const today = new Date();
  const end = competition.endDate
    ? new Date(competition.endDate + "T23:59:59Z")
    : today;
  const last = today < end ? today : end;

  let total = 0;
  let matchesPlayed = 0;
  let firstGoalDate = null;

  for (let d = new Date(start); d <= last; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = ymd(d);
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard?dates=${day}&limit=100`;
    let json;
    try {
      json = await fetchJson(url);
    } catch (e) {
      warn(`golos ${day}: ${e.message}`);
      continue;
    }
    for (const ev of json.events ?? []) {
      const comp = ev.competitions?.[0];
      if (!comp) continue;
      const state = comp.status?.type?.state; // pre | in | post
      if (state === "pre") continue;
      const goalsInMatch = (comp.competitors ?? []).reduce(
        (sum, c) => sum + (parseInt(c.score, 10) || 0),
        0
      );
      matchesPlayed += 1;
      total += goalsInMatch;
      if (goalsInMatch > 0 && ev.date) {
        if (!firstGoalDate || new Date(ev.date) < new Date(firstGoalDate)) {
          firstGoalDate = ev.date;
        }
      }
    }
    await new Promise((r) => setTimeout(r, 120)); // simpático para a API
  }

  return { total, matchesPlayed, firstGoalDate };
}

/* ------------------------------------------------------------------ */
/* Km — Google Sheets exportado em CSV                                 */
/* ------------------------------------------------------------------ */

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

// Converte "5,2 km", "10.3", "  7 " -> número. Trata vírgula como decimal (pt-PT).
function toNumber(raw) {
  if (raw == null) return null;
  let s = String(raw).trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/km|kms|k|,/g, (m) => (m === "," ? "." : "")); // remove unidade, vírgula -> ponto
  s = s.replace(/[^0-9.\-]/g, "");
  if (s === "" || s === "." || s === "-") return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function looksLikeDistanceHeader(h) {
  return /(km|dist|distan)/i.test(h || "");
}

// Fator para converter a coluna em km. Deteta metros pelo cabeçalho
// (ex.: "Distance (m)") ou aceita override na config (distanceUnit: "m"|"km").
function unitFactor(configUnit, header) {
  if (configUnit) {
    return /^m(et|ts)?/i.test(String(configUnit).trim()) ? 0.001 : 1;
  }
  const h = (header || "").toLowerCase();
  if (/\bkm\b|quil[oó]met|kms/.test(h)) return 1; // já em km
  if (/\(m\)|met(ro|er)s?|\bmts?\b/.test(h)) return 0.001; // metros -> km
  return 1; // sem indicação: assume km
}

// Heurística simples para reconhecer uma data (coluna do detalhe).
function looksLikeDate(s) {
  if (!s) return false;
  if (/^\d{1,2}[\/.\-]\d{1,2}([\/.\-]\d{2,4})?$/.test(s)) return true; // 11/06 ou 11/06/2026
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) return true; // ISO
  if (/\d{1,2}\s*(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)/i.test(s)) return true;
  return false;
}

// Dado o CSV já em linhas, descobre a coluna da distância e soma-a.
// Função pura (sem rede) para ser testável.
function computeKm(rows, sheet = {}) {
  if (!rows.length) throw new Error("folha vazia");

  const header = rows[0].map((h) => h.trim());
  // Há cabeçalho se a primeira linha não for maioritariamente numérica.
  const headerNumeric = header.filter((h) => toNumber(h) != null).length;
  const hasHeader = headerNumeric <= header.length / 2;

  // 1) coluna indicada na config
  let colIndex = -1;
  if (sheet.distanceColumn != null) {
    colIndex = header.findIndex(
      (h) => h.toLowerCase() === String(sheet.distanceColumn).toLowerCase()
    );
    if (colIndex === -1 && Number.isInteger(sheet.distanceColumn)) {
      colIndex = sheet.distanceColumn;
    }
  }
  // 2) cabeçalho que parece distância
  if (colIndex === -1 && hasHeader) {
    colIndex = header.findIndex((h) => looksLikeDistanceHeader(h));
  }
  // 3) coluna com mais valores numéricos
  if (colIndex === -1) {
    const cols = header.length;
    let best = -1;
    let bestCount = 0;
    for (let c = 0; c < cols; c++) {
      let count = 0;
      for (let r = hasHeader ? 1 : 0; r < rows.length; r++) {
        if (toNumber(rows[r][c]) != null) count++;
      }
      if (count > bestCount) {
        bestCount = count;
        best = c;
      }
    }
    colIndex = best;
  }
  if (colIndex === -1) throw new Error("nenhuma coluna numérica encontrada");

  // Coluna das datas (para o detalhe): cabeçalho "data"/"dia" ou valores que parecem datas.
  let dateIndex = -1;
  if (hasHeader) {
    dateIndex = header.findIndex((h) => /(data|date|dia)/i.test(h));
  }
  if (dateIndex === -1) {
    for (let c = 0; c < header.length; c++) {
      if (c === colIndex) continue;
      let hits = 0;
      let total = 0;
      for (let r = hasHeader ? 1 : 0; r < rows.length; r++) {
        const v = (rows[r][c] ?? "").trim();
        if (!v) continue;
        total++;
        if (looksLikeDate(v)) hits++;
      }
      if (total > 0 && hits >= total * 0.6) {
        dateIndex = c;
        break;
      }
    }
  }

  // Lista de corridas + total calculado a partir dela (fica sempre consistente).
  // Converte para km conforme a unidade da coluna (metros -> km).
  const factor = unitFactor(sheet.distanceUnit, header[colIndex]);
  const runs = [];
  const seen = new Set(); // ignora duplicados exatos (mesma data + mesma distância)
  let sum = 0;
  for (let r = hasHeader ? 1 : 0; r < rows.length; r++) {
    const cell = (rows[r][colIndex] ?? "").trim();
    const raw = toNumber(cell);
    if (raw == null) continue;
    const date = dateIndex >= 0 ? (rows[r][dateIndex] ?? "").trim() || null : null;
    const key = `${date ?? ""}|${cell}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const km = raw * factor;
    sum += km;
    runs.push({ date, km: Math.round(km * 100) / 100 });
  }

  return {
    km: Math.round(sum * 100) / 100,
    colIndex,
    label: header[colIndex] ?? colIndex,
    dateLabel: dateIndex >= 0 ? header[dateIndex] ?? dateIndex : null,
    unit: factor === 0.001 ? "m" : "km",
    runs,
  };
}

// Tenta dois endpoints de exportação CSV do Google Sheets.
// Ambos exigem a folha partilhada como "Qualquer pessoa com o link: Visualizador".
async function fetchSheetCsv(id, gid) {
  const urls = [
    `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${gid}`,
    `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`,
  ];
  let lastStatus = 0;
  for (const url of urls) {
    let res;
    try {
      res = await fetch(url, {
        headers: { "User-Agent": "um-golo-um-km/1.0" },
        redirect: "follow",
      });
    } catch (e) {
      lastStatus = lastStatus || -1;
      continue;
    }
    if (res.ok) {
      const text = await res.text();
      // Uma folha privada devolve a página de login (HTML), não CSV.
      if (/^\s*<(!doctype|html)/i.test(text)) {
        lastStatus = 401;
        continue;
      }
      return text;
    }
    lastStatus = res.status;
  }
  throw new Error(
    `HTTP ${lastStatus} ao ler a folha — partilha-a como ` +
      `"Qualquer pessoa com o link: Visualizador"`
  );
}

async function fetchKm(sheet) {
  const gid = sheet.gid ?? "0";
  const rows = parseCsv(await fetchSheetCsv(sheet.id, gid));
  log(`cabeçalhos: ${(rows[0] ?? []).join(" | ")}`);
  const { km, label, colIndex, dateLabel, unit, runs } = computeKm(rows, sheet);
  log(
    `km: coluna "${label}" (índice ${colIndex}, unidade ${unit})` +
      `${dateLabel ? `, datas "${dateLabel}"` : ", sem coluna de datas"}, ` +
      `${runs.length} corrida(s), total ${km.toFixed(2)} km`
  );
  runs.forEach((r, i) =>
    log(`  corrida ${i + 1}: ${r.date ?? "s/ data"} -> ${r.km} km`)
  );
  return { km, runs };
}

/* ------------------------------------------------------------------ */
/* Orquestração                                                        */
/* ------------------------------------------------------------------ */

async function main() {
  const config = await readJson(CONFIG_PATH);
  if (!config) throw new Error("config.json não encontrado");
  const previous = (await readJson(DATA_PATH)) ?? {};
  const prevWasSample = previous.isSample === true; // não arrastar dados de exemplo
  const prevRunners = new Map(
    (previous.runners ?? []).map((r) => [r.id, r])
  );
  const errors = [];

  // Golos
  let goals =
    !prevWasSample && previous.goals
      ? previous.goals
      : { total: 0, matchesPlayed: 0, firstGoalDate: null };
  try {
    goals = await fetchGoals(config.competition);
    log(`golos: ${goals.total} em ${goals.matchesPlayed} jogos`);
  } catch (e) {
    warn(`golos: ${e.message} — mantido valor anterior`);
    errors.push(`golos: ${e.message}`);
  }

  const kmPerGoal = config.challenge?.kmPerGoal ?? 1;
  const required = goals.total * kmPerGoal;

  // Atletas
  const runners = [];
  for (const r of config.runners ?? []) {
    const prev = prevRunners.get(r.id) ?? {};
    if (!r.sheet) {
      runners.push({
        id: r.id,
        name: r.name,
        km: null,
        required,
        remaining: null,
        progress: null,
        status: "pending",
        runs: [],
      });
      continue;
    }
    let km = prevWasSample ? null : prev.km ?? null;
    let runs = prevWasSample ? [] : prev.runs ?? [];
    let status = "ok";
    try {
      const result = await fetchKm(r.sheet);
      km = result.km;
      runs = result.runs;
    } catch (e) {
      warn(`km ${r.id}: ${e.message} — mantido valor anterior`);
      errors.push(`km ${r.name}: ${e.message}`);
      status = km == null ? "error" : "stale";
    }
    runners.push({
      id: r.id,
      name: r.name,
      km,
      required,
      remaining: km == null ? null : Math.round((required - km) * 100) / 100,
      progress: km == null || required === 0 ? 0 : km / required,
      status,
      runs,
    });
  }

  const out = {
    isSample: false,
    generatedAt: new Date().toISOString(),
    competition: {
      name: config.competition.name,
      startDate: config.competition.startDate,
    },
    challenge: { title: config.challenge?.title ?? "", kmPerGoal },
    goals,
    runners,
    errors,
  };

  await mkdir(dirname(DATA_PATH), { recursive: true });
  await writeFile(DATA_PATH, JSON.stringify(out, null, 2) + "\n");
  log(`escrito ${DATA_PATH}`);
  if (errors.length) warn(`concluído com ${errors.length} erro(s)`);
}

// Exporta para testes; corre main() só quando invocado diretamente.
export { parseCsv, toNumber, computeKm, fetchKm, fetchGoals, main };

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => {
    console.error("[update-data] ERRO FATAL:", e);
    process.exit(1);
  });
}

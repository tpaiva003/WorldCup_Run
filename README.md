# Um Golo · Um Km — Desafio Mundial 2026

Por cada golo marcado no Mundial 2026, o Daniel e o José correm **1 km**.
Este site mostra o número de golos e os km corridos por cada um — e atualiza-se
**sozinho**.

## Como funciona

```
ESPN (golos do Mundial)  ─┐
                          ├──►  GitHub Action (de 30 em 30 min)  ──►  data/data.json  ──►  site
Google Sheets (km)       ─┘
```

- **`scripts/update-data.mjs`** — vai buscar os golos à API pública da ESPN e os
  km às folhas de cálculo do Google, e escreve `data/data.json`. Sem chaves nem
  dependências (Node 20+, `fetch` nativo).
- **`.github/workflows/update-data.yml`** — corre o script a cada 30 min, e faz
  commit do `data.json` se houver novidades.
- **`index.html` + `assets/`** — o painel. Lê o `data.json` e atualiza-se também
  no browser de 5 em 5 min.

A contagem arranca no **primeiro golo do Mundial** (a data é detetada
automaticamente) e o objetivo de cada atleta é igual ao total de golos.

## Pôr a funcionar (uma vez)

1. **Faz merge** desta branch para `main`.
2. **Ativa o GitHub Pages:** *Settings → Pages → Build and deployment →
   Deploy from a branch → `main` / `/ (root)`*. O site fica em
   `https://<utilizador>.github.io/run/`.
3. **Confirma que a folha do Daniel** está partilhada como *"Qualquer pessoa com
   o link pode ver"* (já está, pelo link enviado).
4. Em *Actions*, corre o workflow **"Atualizar dados do desafio"** uma vez
   (botão *Run workflow*) para substituir os dados de exemplo por dados reais.

> Os dados que vêm no repositório são **de exemplo** (marcados como tal no site)
> só para se ver o aspeto. A primeira execução do Action substitui-os pelos reais.

## Registar os km (folha partilhada)

A forma mais fácil de manter o site atualizado é uma **única folha Google** com
**uma linha por corrida** (só corridas — não caminhadas):

| Atleta | Data | KM |
|---|---|---|
| José | 2026-06-14 | 10 |
| Tiago | 2026-06-14 | 10 |
| José | 2026-06-13 | 4.04 |

- A folha tem de estar partilhada como **"Qualquer pessoa com o link: Visualizador"**.
- O id da folha vai no `config.json` em `kmSheet.id` (a parte do link entre `/d/` e `/edit`).
- O nome na coluna **Atleta** tem de bater com o `name`/`aliases` de cada corredor.
- Para registar uma corrida, **acrescenta uma linha** — o site atualiza-se sozinho (de 30 em 30 min).

O script deteta as colunas pelo cabeçalho (*Atleta/Nome*, *Data*, *KM/Distância*),
remove duplicados (mesma data + distância) e converte metros → km se o cabeçalho
disser `(m)`. Se a folha falhar ou estiver vazia, usa o `manualRuns` de cada
corredor (em `config.json`) como reserva.

## Afinações no `config.json`

| Campo | O que faz |
|---|---|
| `challenge.kmPerGoal` | Km por golo (por omissão **1**). |
| `competition.startDate` | Início do mundial; conta golos e sequências a partir daqui. |
| `kmSheet.id` / `.gid` | Folha partilhada de km e o separador (`0` = primeiro). |
| `runners[].name` / `.aliases` | Nome mostrado e nomes aceites na coluna *Atleta*. |
| `runners[].manualRuns` | Corridas manuais (reserva): `[{ "date": "2026-06-14", "km": 10 }]`. |

A ordem dos corredores no `config.json` é a ordem dos cartões no site.
O site tem ainda um **botão PT/EN** no canto superior para trocar de idioma.

## Correr localmente

```bash
node scripts/update-data.mjs     # atualiza data/data.json (precisa de internet)
python3 -m http.server 8000      # depois abre http://localhost:8000
```

## Estilo

Layout escuro e editorial, com um acento elétrico e detalhes "de terminal",
inspirado em terminal-industries, siena.film, apple, exoape e collabcapitolium.

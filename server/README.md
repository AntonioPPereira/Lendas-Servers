# LENDAS backend

API própria do painel LENDAS. Primeira fatia: catálogo de demos, lido em
tempo real do filesystem do servidor via SFTP — sem mock, sem banco.

Rodando em produção contra a conta SFTP real desde 2026-08-25: **487 demos
reais** descobertas automaticamente nos dois servidores da rede.

## Setup

```bash
cd server
npm install
cp .env.example .env
# preencha SFTP_USERNAME e SFTP_PASSWORD no .env
npm run dev
```

O servidor sobe em `http://localhost:8787` (configurável via `PORT`).

Se a conexão falhar e a mensagem não for clara o bastante, rode o
diagnóstico com o protocolo SSH em modo verboso (nunca imprime a senha):

```bash
node scripts/diagnose-sftp.mjs
```

## Variáveis de ambiente

Ver `.env.example`. Nenhuma tem valor padrão sensível — `SFTP_USERNAME` e
`SFTP_PASSWORD` são obrigatórias e o processo recusa subir sem elas (falha
cedo, no boot, não na primeira requisição).

`SFTP_BASE` (padrão `/`) é a pasta que contém uma subpasta por servidor de
jogo, nomeada `IP_PORTA` (ex: `104.234.65.244_27800`) — descoberto direto no
gerenciador de arquivos do ClanServers em 2026-08-25. **Não é preciso
cadastrar cada servidor**: o backend lista `SFTP_BASE` a cada refresh do
cache e reconhece sozinho qualquer pasta nesse formato como um servidor,
esperando `cstrike/demos/YYYY-MM/...` dentro dela. Um terceiro servidor
aparecendo ali passa a ser descoberto automaticamente, sem deploy.

## Endpoints

| Rota | Descrição |
|---|---|
| `GET /api/health` | Liveness check, sem tocar no SFTP |
| `GET /api/demos` | Lista paginada. Query: `page`, `pageSize` (máx. 50), `map`, `server`, `q` |
| `GET /api/demos/:id` | Uma demo |
| `GET /api/demos/:id/download` | Transmite o `.dem` original, em streaming |

Formato de cada demo (exemplo real, capturado em produção):

```json
{
  "id": "27800-20260825-2020-de_inferno",
  "filename": "20260825-2020-de_inferno.dem",
  "map": "de_inferno",
  "date": "2026-08-25",
  "time": "20:20",
  "recordedAt": "2026-08-25T20:20:00",
  "size": 4132864,
  "server": "104.234.65.244:27800"
}
```

Não há `placar`, `duração`, `MVP` ou `vencedor` — nada disso é extraível de
um `list`/`stat` de arquivo. Ver a seção "Limitações conhecidas" no relatório
da integração (mensagem do Claude) para o que falta pra isso existir.

## Segurança do ID

O `id` (`27800-20260825-2020-de_inferno`) não é um ponteiro pra um caminho —
é validado por um regex fechado (`lib/demoId.ts`) e o backend **reconstrói**
o caminho real a partir dele: o prefixo numérico é a porta do servidor (acha
a raiz certa entre as descobertas), e a pasta `YYYY-MM` vem da própria data
no nome. O cliente nunca informa um caminho, pasta, servidor ou extensão.
Isso torna path traversal e contrabando de extensão estruturalmente
impossíveis, não apenas filtrados — não existe combinação de caracteres
aceita pelo regex que resulte em `..`, `/` ou uma extensão diferente de
`.dem`.

## Testes

```bash
npm test
```

38 testes, sem tocar rede nenhuma (o cliente SFTP é injetado via construtor —
`SftpDemoService` recebe uma fábrica, os testes passam um cliente falso em
memória, com dois servidores simulados). Cobrem: descoberta de servidores,
listagem/filtragem de pastas e arquivos, parsing de ID com porta, cache com
TTL e fallback pra dado velho quando a fonte cai, rejeição de path traversal
e de extensão inválida (nunca chegam a abrir uma conexão), streaming de
download, classificação de erro de autenticação vs. indisponibilidade, e os
mesmos cenários no nível HTTP (`routes.demos.test.ts`, via `supertest`).

## Filtro de requisitos (`lendas_steamfilter`) — `GET /api/activity`

O servidor de jogo roda um plugin SourceMod próprio (`lendas_steamfilter.smx`,
fonte em `addons/sourcemod/scripting/lendas_steamfilter.sp` na cópia local do
server) que decide no `connect` se um jogador pode ficar: VAC/game ban, idade
da conta Steam, horas de CS:S, perfil privado e Family Sharing. **Essa
decisão é e continua sendo do plugin** — o backend só lê o veredito já
tomado, nunca recalcula regra nenhuma.

### Como o backend lê o veredito — sem banco de dados

O plugin também sabe gravar cada checagem numa tabela MySQL (`lsf_checks`,
schema em `_ferramentas/schema.sql` do plugin) — mas essa gravação vem
**desligada por padrão** e ativá-la exigiria mexer em produção (criar
usuário de banco, editar `databases.cfg`, reiniciar os dois servidores).

Auditando os logs diários que o SourceMod já escreve incondicionalmente
(`cstrike/addons/sourcemod/logs/L<YYYYMMDD>.log`), confirmamos em produção
(2026-08-25, nos dois servidores) que o veredito completo **já está lá**,
sempre, sem nenhuma configuração extra:

```
L 08/25/2026 - 00:02:43: [lendas_steamfilter.smx] Bloqueado MXDELTA<96><[U:1:1841605867]><> - 0h de CS:S (minimo 20h)
L 08/24/2026 - 08:14:01: [lendas_steamfilter.smx] APROVADO: vol-0<100><[U:1:483403219]><> passou em todas as checagens.
```

Esses logs moram dentro do moddir de cada servidor (`cstrike/`), reachável
pela **mesma conexão SFTP já usada pras demos** (`SFTP_*` no `.env`) — os
dois recursos vivem sob a mesma raiz "IP_PORTA" descoberta automaticamente.
Por isso `SteamFilterLogService` não tem credencial própria nenhuma: reusa
`config.sftp` (`src/index.ts`), e não existe estado "não configurado" — se o
SFTP de demos funciona, isto funciona, sem nenhum passo de ativação.

Só as duas linhas terminais de cada checagem importam (isoladas em
`src/lib/steamFilterLog.ts`): `Bloqueado <jogador> - <motivo>` vira
`"blocked"`, `APROVADO: <jogador> passou em todas as checagens.` vira
`"join"`. As linhas de diagnóstico (`[bans]`, `[perfil]`, `[horas]`,
`[shared]`, `ERRO API: ...`) são ruído — mesmo quando uma chamada à Steam
falha, o plugin fecha com `APROVADO` do mesmo jeito (fail-open, documentado
no próprio `LEIA-ME.md` do plugin: uma instabilidade da Steam não pode
derrubar o MIX inteiro), então a distinção "aprovado vs. erro de API" nunca
muda o que aparece pro jogador nem pro site.

### Contrato de `GET /api/activity`

Mesmo shape do `ActivityEvent` do frontend. Exemplo real, capturado em
produção:

```json
[
  { "id": "lsflog-L20260825.log-1017", "kind": "blocked", "at": "2026-08-25T22:18:34", "actor": "ffrankvooid", "detail": "horas de CS:S nao verificaveis" },
  { "id": "lsflog-L20260825.log-1001", "kind": "join", "at": "2026-08-25T22:09:25", "actor": "vitorpielechovski" }
]
```

### Limitações conhecidas (auditadas, não é falta de esforço)

- **Nunca existe `kind: "leave"`**: o plugin não loga desconexão, só o
  veredito da entrada. Documentado como indisponível, não simulado.
- **Sem atribuição de servidor**: cada servidor tem seu próprio arquivo de
  log, mas o backend funde os eventos de ambos numa lista só — o
  `serverId` do `ActivityEvent` não é preenchido a partir desta fonte.
- **Admin com a flag de imunidade não gera linha nenhuma** — o plugin pula
  a checagem inteira pra quem tem `lsf_immunity_flag`, então essas conexões
  são invisíveis pra este feed (indistinguível de "não conectou").
- **Não existe estado "pendente"**: enquanto as checagens (até 4 chamadas
  paralelas à Steam) estão em voo, não há linha no log ainda — só o
  veredito final é escrito.
- Lê só o log de hoje e o de ontem por servidor (`RECENT_DAY_FILES`), o
  suficiente pra cobrir a virada de meia-noite sem varrer o histórico
  inteiro a cada refresh.

### Testes

`test/steamFilterLog.test.ts` cobre o parser contra um fixture real
(`test/fixtures/lendas_steamfilter-L20260825.log`, capturado em produção).
`SteamFilterLogService.test.ts` (cliente SFTP falso injetado via construtor,
mesmo padrão do `SftpDemoService`) cobre: descoberta das pastas de
servidor, leitura de hoje+ontem por servidor, ordenação/limite, cache com
TTL e fallback pra cache velho, e a classificação de erro de SFTP
(reaproveita `SftpAuthError`/`SftpUnavailableError`, já existentes pras
demos). `routes.activity.test.ts` cobre o mesmo no nível HTTP, incluindo a
garantia de que `"leave"` nunca é emitido.

## Live: placar, round e jogadores ao vivo

Um plugin SourceMod novo e separado, `lendas_live.smx` (não mexe no
`lendas_steamfilter`, não duplica a lógica de requisitos dele — ver o
`LEIA-ME-LIVE.md` na cópia do servidor), manda o estado real do jogo em
lotes autenticados pra `POST /api/live/events`. O backend mantém esse
estado em memória (`LiveMatchState`) e repassa via SSE
(`GET /api/live/stream`) pro `SseTransport` que **já existe** no frontend
(`painel/src/realtime/transport.ts`) — nenhuma peça nova do lado do
cliente, só apontar `VITE_LIVE_TRANSPORT=sse` e `VITE_LIVE_URL` pra essa
rota liga tudo (placar, scoreboard, round strip, SignalBar).

### Autenticação (SourceMod → backend)

`Authorization: Bearer <LIVE_API_TOKEN>`, comparado em tempo constante
(`middleware/liveAuth.ts`). Token vazio (padrão) = a rota inteira responde
`503 live_ingest_not_configured` — nunca aceita evento sem token real
configurado (fail **closed**, ao contrário do `lendas_steamfilter`, que
fail-open é a escolha certa pra ele; aqui não há justificativa equivalente
pra aceitar telemetria não autenticada).

### Vários servidores, uma partida em destaque

Os dois servidores CS:S podem mandar snapshot ao mesmo tempo.
`LiveMatchState` guarda o estado de cada `serverId` separado e escolhe como
"a partida ao vivo" o que tiver mais jogadores conectados agora — mesmo
critério do `pickPrimaryServer()` do frontend, pra não existir duas noções
diferentes de "servidor principal". Um servidor sem snapshot novo por
`LIVE_STALE_MS` (padrão 30s) é removido do estado — server caiu ou o
plugin travou não deixa uma partida fantasma congelada na tela.

### Avatares reais

O plugin manda só o SteamID64 capturado — nunca consulta a Steam. Quem
resolve o avatar é o backend (`SteamAvatarService`, `STEAM_API_KEY` só
aqui), com cache de 1h por padrão. Sem key configurada, `avatarUrl`
simplesmente não é preenchido e o frontend usa o emblema gerado
(`PlayerAvatar` já tinha esse fallback pronto).

### Sem dado nenhum ainda = estado vazio, nunca mock

Antes do primeiro snapshot chegar (backend acabou de subir, plugin ainda
não conectou), `GET /api/live/stream` não manda frame nenhum de `match` —
só o comentário de abertura. Isso expôs um bug real durante o
desenvolvimento: o estado inicial do `liveStore` no frontend usava a
partida *simulada* (`INITIAL_MATCH`) como valor-padrão, então uma conexão
SSE real sem dado nenhum ainda mostraria placar inventado por alguns
segundos. Corrigido trocando o padrão do store por um estado neutro
(`EMPTY_MATCH`: 0 a 0, sem jogadores, fase "warmup") — o `MockTransport`
continua substituindo isso pela partida fake dele normalmente, só o modo
real que agora nunca herda dado de mentira.

### Contrato de `POST /api/live/events`

```json
{
  "serverId": "104.234.65.244_27800",
  "events": [
    { "kind": "server_snapshot", "hostname": "...", "map": "de_dust2", "players": 12, "maxPlayers": 15, "round": 7, "ctScore": 4, "tScore": 3, "phase": "live", "bombPlanted": false, "clock": 62, "timestamp": "2026-08-26T00:00:00Z" },
    { "kind": "player_snapshot", "timestamp": "...", "players": [ { "steamId64": "7656119...", "steamId": "STEAM_1:0:1", "nickname": "...", "userId": 5, "team": "CT", "alive": true, "health": 80, "armor": 100, "money": 3200, "kills": 12, "deaths": 4, "assists": 2, "score": 26, "ping": 35, "weapon": "ak47", "mvps": 2, "connectedSeconds": 600 } ] }
  ]
}
```

Todos os `kind` aceitos: `server_snapshot`, `player_snapshot`, `map_start`,
`map_end`, `round_start`, `round_end`, `player_connect`,
`player_disconnect`, `player_team`, `player_death`, `bomb_planted`,
`bomb_defused`, `bomb_exploded` — schema completo e validado com zod em
`src/live/schema.ts`. SteamID64 é validado como inteiro de 17 dígitos
dentro da faixa real (`>= 76561197960265728`); qualquer coisa fora disso
(ou um `kind` desconhecido) é `400 invalid_payload`, o lote inteiro
rejeitado — o plugin mantém o evento na fila e tenta de novo depois.

### Limitações conhecidas (herdadas do que o CS:S expõe, não falta de esforço)

- `clock` é uma estimativa (fase atual + convar real `mp_freezetime`/
  `mp_roundtime`/`mp_c4timer`), omitido em warmup/ended onde não há
  referência confiável.
- Round não sobrevive a um reload do plugin no meio do mapa (o CS:S não
  tem uma native de "round atual") — mitigado instalando com restart
  completo, não hot-reload.
- "halftime" nunca é reportado — o CS:S clássico não dispara evento
  confiável pra isso.

### Testes

`live.schema.test.ts` (validação, incluindo SteamID64 malformado),
`LiveMatchState.test.ts` (reducer puro: snapshot, troca de primário,
staleness, round/bomb/death), `LiveBroadcaster.test.ts` (fan-out SSE,
remoção de assinante com pipe quebrado), `SteamAvatarService.test.ts`
(cache, DI de fetch, nunca lança), `routes.live.test.ts` (autenticação,
validação HTTP, ingestão → stream fim a fim com um servidor real ouvindo
numa porta efêmera — supertest não é confiável pra stream longo).

## Banimentos (SourceBans++) — `GET /api/bans`

A lista de punições vem do banco do **SourceBans++**, mas o backend **não**
fala com esse MySQL. Motivo, verificado em produção em 2026-08-30: o usuário
do banco só aceita conexão vinda do próprio servidor de jogo — de qualquer
outro lugar a resposta é `Access denied for user ...@<ip>`, mesmo com a senha
correta — e o painel da hospedagem (ClanServers) não expõe "Remote MySQL"
pra liberar o IP do backend.

Em vez de depender de um pedido ao suporte, o caminho é o mesmo já usado por
demos e atividade: **o servidor de jogo escreve, o backend lê por SFTP**.

1. O plugin `lendas_bans` (SourceMod, roda no servidor de jogo) consulta o
   MySQL **localmente** — onde o acesso já funciona — e escreve
   `addons/sourcemod/data/lendas_bans.json` a cada `lendas_bans_interval`
   segundos (padrão 300).
2. `SourceBansService` lê esse JSON pela conexão SFTP já configurada e
   guarda em cache por `BANS_CACHE_TTL_MS`.
3. `src/lib/sourceBans.ts` traduz cada linha pro shape do painel.

Efeito colateral bom: o banco nunca fica exposto à internet.

### O que o plugin já resolve na origem

- **IP nunca sai inteiro**: os dois últimos octetos são mascarados no próprio
  servidor (`189.45.x.x`), então o endereço completo não trafega nem é
  guardado do lado do site.
- **Acentos**: a conexão pede `utf8mb4`. Sem isso, nick de admin com cedilha
  saía como byte inválido e quebrava o JSON (visto na prática).
- **Escrita atômica**: grava num `.tmp` e só então renomeia — se o backend
  ler exatamente durante a exportação, pega o arquivo anterior inteiro em vez
  de um JSON cortado no meio.

### Regras de tradução (todas testadas)

- `SteamID` → `SteamID64` com **BigInt**: o cálculo não cabe em 32 bits, que é
  justamente por que o plugin não faz essa conta.
- **Estado**: `removeType` preenchido (punição levantada por admin) vence
  qualquer outra regra e vira `expired` — inclusive num ban permanente.
  Depois: `length = 0` é `permanent`; prazo vencido é `expired`; o resto é
  `active`. Ou seja, `active` são só os **temporários em vigor** — os
  permanentes são contados à parte, não somem.
- **Tipo**: `sb_bans` vira `ban`; `sb_comms` vira `mute` (type 1) ou `gag`
  (type 2). Tipo desconhecido cai em `silence` e **nunca** em `ban`, pra não
  confundir restrição de fala com banimento.
- `id` recebe prefixo (`b`/`c`) porque `sb_bans` e `sb_comms` numeram `bid`
  à parte e colidiriam.

### Limitações conhecidas (auditadas, não é falta de esforço)

- **Atraso de até 5 min** entre o ban ser aplicado e aparecer no site — é o
  intervalo do plugin. `sm_lendas_bans_export` força na hora.
- **Sem link de prova**: o SourceBans não guarda esse campo, então `evidence`
  é sempre `null` em vez de um link inventado.
- **`country` costuma vir vazio** nesta instância; quando vem, é o código de
  2 letras que o próprio SourceBans gravou.
- Ban por IP não tem `SteamID` — `steamId64` fica vazio e o painel
  simplesmente não oferece link de perfil.

## Avatares reais no ranking — índice `nick -> SteamID64`

O ranking vem do HLstatsX, que expõe **só o nick** — nunca o SteamID
(auditado, não é falta de tentar). Sem SteamID não há como pedir a foto à
Steam, e o painel inteiro fica com o emblema gerado.

Quem conhece o SteamID de cada jogador é o **servidor de jogo**. Então o
plugin `lendas_players` registra o par `nick -> SteamID64` num JSON
(`addons/sourcemod/data/lendas_players.json`), e `PlayerDirectoryService` lê
esse arquivo pela mesma conexão SFTP de sempre.

O índice é **cumulativo**: o plugin carrega o arquivo ao subir e só
acrescenta. Quem não joga há meses continua listado — que é exatamente o
caso que interessa, já que ele segue aparecendo no ranking histórico.

### Duas fontes de SteamID, nesta ordem

1. `NicknameDirectory` — quem o `lendas_live` acabou de reportar. Em memória
   (some no restart), mas é o vínculo mais recente entre nick e conta.
2. `PlayerDirectoryService` — o índice histórico acima. Persistente.

A primeira ganha em caso de conflito: se a pessoa está jogando agora, aquele
é o vínculo atual.

### Uma requisição por página, não uma por jogador

`resolveAvatarsByNickname` resolve a página inteira de uma vez.
`GetPlayerSummaries` aceita 100 IDs por chamada e uma página tem no máximo
100 linhas — então isso custa **uma** requisição à Steam. Há teste
justamente pra isso.

Antes as rotas usavam `avatars.peek()` (só cache, sem rede), o que na prática
resolvia **zero** avatares: nada populava o cache por outro caminho. Agora
usam `resolve()`.

### Cobertura é parcial por natureza

Medido em 2026-08-30: **63 dos 100** primeiros do ranking. Os outros são
jogadores do ranking histórico que não aparecem nos logs recentes. Eles
seguem com o emblema gerado — que é honesto, porque é visivelmente gerado, e
não uma foto de outra pessoa.

O índice nasceu com 454 jogadores, semeados a partir de 100 dias de log
(`nick<uid><[U:1:N]>`, o formato `%L` do SourceMod). Daqui pra frente cresce
sozinho, a cada jogador que entra.

### Limitações conhecidas

- **Nick é a chave**, porque é só isso que o HLstatsX dá. Dois jogadores
  diferentes com exatamente o mesmo nick colidem — o último a entrar vence.
  Não há como desambiguar sem SteamID no ranking, que é justamente o que
  falta.
- Conta com perfil privado ou sem avatar público não entra no resultado;
  nunca é substituída por um placeholder remoto.
- `STEAM_API_KEY` vazia desliga tudo isso silenciosamente (por design) — o
  frontend cai pro emblema gerado.

## Estatísticas do servidor — `GET /api/stats`

Números somados de TODO o histórico, lidos de três páginas do HLstatsX que
respondem de forma confiável: `mode=weapons`, `mode=actions` e `mode=maps`.

### O que esta rota deliberadamente NÃO tem

Recorte por jogador. Nada de "quem matou mais com a AK". O `mode=playerinfo`
desta instalação trava pra qualquer jogador com avatar Steam real (auditado,
ver `HLStatsService`), e a página `mode=awards` — que traria exatamente esses
pódios — está **vazia** nesta instalação ("No Award Winner, 0 kills"): o cron
de prêmios do HLstatsX não roda. Sem fonte, não há pódio; estimar seria
indistinguível de inventar. A própria tela explica isso ao leitor.

Para ter esse dado seria preciso um plugin acumulando `player_death` no
servidor de jogo — e ele só contaria dali pra frente, sem histórico.

### Cuidados que valeram tempo

- **Os códigos das ações não são os óbvios.** Plantar a bomba é
  `Planted_The_Bomb` (não `Plant_Bomb`), multi-kill é `kill_streak_N` (não
  `double_kill`), e MVP é `round_mvp` minúsculo. Há fallback por nome de
  exibição, mas o código é o caminho principal — conferir no HTML real antes
  de mudar qualquer constante em `lib/serverStats.ts`.
- **`Terrorists_Win` significa "os CTs foram eliminados"**: o código nomeia
  quem venceu, o rótulo nomeia quem morreu. Trocar os dois inverte a leitura
  de equilíbrio na tela.
- **"28,263 times"**: a contagem vem com sufixo, e `parseIntLoose` (com
  razão) recusa a string inteira — o número é recortado antes.
- **Ausência vira `null`, nunca `0`.** O HLstatsX só lista ação que já
  aconteceu ao menos uma vez; devolver zero afirmaria "ninguém nunca fez",
  que é diferente de "a fonte não informa". A tela omite a linha.
- **O total de kills sai das ARMAS, não dos mapas.** Abate sem arma
  identificada entra num e não no outro; somar mapas daria número diferente
  pra mesma pergunta.

### Falha parcial não derruba a tela

As três páginas são buscadas em paralelo e cada uma é opcional: se `actions`
cair, `weapons` e `maps` ainda respondem. Só quando as três vêm vazias a rota
falha. Cache longo (4× o do ranking) — são somas históricas, mudam devagar.

## Arquitetura interna

```
src/
├── config.ts              # única leitura de process.env, validada com zod
├── errors.ts               # erros tipados + classificador de erro do ssh2
├── lib/
│   ├── demoId.ts            # parsing/validação/resolução de caminho (o núcleo de segurança)
│   ├── steamFilterLog.ts    # parsing das linhas de veredito do lendas_steamfilter
│   ├── cache.ts             # TTL cache com dedupe de chamadas concorrentes
│   └── paginate.ts
├── live/
│   ├── schema.ts            # contrato zod do POST /api/live/events
│   ├── state.ts             # LiveMatchState — reducer em memória, escolhe o servidor primário
│   └── broadcaster.ts       # fan-out SSE pros clientes conectados
├── services/
│   ├── SftpDemoService.ts   # único ponto de contato com o SFTP; descobre servidores sozinho
│   ├── HLStatsService.ts    # scraping do HLstatsX (servidores/ranking/jogadores)
│   ├── SteamFilterLogService.ts # lê os logs do plugin via SFTP (mesma conexão das demos)
│   └── SteamAvatarService.ts # resolve avatar real via Steam Web API a partir do SteamID64
├── routes/demos.ts          # HTTP: valida query, chama o serviço, monta o DTO
├── routes/activity.ts       # HTTP: veredito do lendas_steamfilter → ActivityEvent
├── routes/liveEvents.ts     # HTTP: POST autenticado do plugin → LiveMatchState + broadcast
├── routes/liveStream.ts     # HTTP: GET SSE pro frontend
├── middleware/errorHandler.ts
├── middleware/liveAuth.ts   # Bearer token em tempo constante
└── app.ts / index.ts
scripts/
└── diagnose-sftp.mjs        # diagnóstico manual de conexão, com log do protocolo SSH
```

`SftpDemoService` nunca recebe um caminho de fora — só IDs, resolvidos
internamente. Cada operação (listagem ou download) abre sua própria conexão
SFTP de vida curta e a fecha no `finally`; a listagem é cacheada
(`DEMOS_CACHE_TTL_MS`, padrão 60s) para não abrir uma conexão a cada elemento
renderizado no frontend.

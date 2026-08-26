# Lendas Network — Central do Servidor

Painel web da comunidade para uma rede de servidores de **Counter-Strike: Source**.
Placar ao vivo, ranking, biblioteca de demos, registro público de banimentos,
histórico de partidas e estatísticas da rede.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + build de produção
npm run preview
```

Sem nenhuma configuração o painel roda com dados gerados e uma partida simulada
que avança em tempo real. Para apontar para uma infraestrutura de verdade, copie
`.env.example` para `.env` e preencha as variáveis.

---

## Identidade visual

A direção nasce do próprio assunto, não de um tema genérico de dashboard.

| Camada | Decisão |
|---|---|
| Base | Grafite frio (`#0a0c0f` → `#1a1f27`), grão de filme a 3,5% e uma vinheta quente vinda do canto superior esquerdo. Nunca preto puro. |
| Acento | **Latão** (`#e8b33a`) — a cor do estojo ejetado e da areia de dust2. Tratado como metal: borda de 1px acesa e um brilho que passa uma única vez, nunca neon. |
| Times | Azul CT (`#4e8fd8`) e areia T (`#c0894a`), as cores do próprio jogo. |
| Séries de gráfico | Passos próprios (`#b8891c`, `#4e8fd8`, `#bb7a2a`) validados para daltonismo e contraste sobre a superfície escura. |
| Display | **Archivo** em largura expandida (`wdth 112`), caixa alta — leitura de sinalização de transmissão, não a itálica condensada de todo template de esports. |
| Interface | **IBM Plex Sans**. Dados, IDs, tempos e placares em **IBM Plex Mono** com algarismos tabulares. |
| Raio | 2–5px. Cantos quase retos: o painel é um instrumento de leitura. |

### Os dois elementos assinatura

**Radar tático** (`components/match/MatchRadar.tsx`) — a placa aérea da partida em
andamento. As posições vêm do feed (normalizadas 0..1), os blips interpolam por
transição de CSS (custo zero de JS por quadro) e cada abate desenha um traçado
entre o autor e a vítima com GSAP.

**Fita de rodadas** (`components/match/RoundStrip.tsx`) — o motivo estrutural que
se repete na partida ao vivo, no histórico, na demo e na página da partida. A cor
diz **qual lado venceu**; o entalhe diz **como** (bomba, desarme, tempo,
eliminação). É um artefato real do jogo, não numeração decorativa.

---

## Arquitetura

```
src/
  data/          modelo de domínio + geração determinística (seed fixo)
  realtime/      transporte (mock | WebSocket | SSE), store e provider
  api/           cliente REST tipado, com fallback para os dados gerados
  lib/           motion (GSAP), formatação pt-BR, clipboard, config
  hooks/         useGsapScope, usePageEnter, useScrollReveal, useCountUp,
                 useValueFlash, useResource, useLocalStorage
  components/
    layout/      AppShell, Sidebar, SignalBar, GlobalSearch
    ui/          Panel, Button, Badge, Field, Modal, Toast, Meter,
                 StatCard, Pagination, States
    match/       LiveMatch, MatchRadar, RoundStrip, Scoreboard, MatchCard
    player/      PlayerAvatar, PlayerCard
    ranking/     Podium, RankingTable
    demo/ ban/ activity/ server/ charts/
  pages/         uma rota por arquivo, admin em subpasta isolada
```

### Tempo real

Existe **uma única costura** entre a interface e o servidor: a interface
`LiveTransport` (`realtime/transport.ts`).

```ts
interface LiveTransport {
  readonly kind: "mock" | "websocket" | "sse";
  connect(handler: (event: LiveEvent) => void): void;
  disconnect(): void;
}
```

`MockTransport` simula a partida (abates, plants, fim de rodada, MVP, respawn) a
1 Hz. `WebSocketTransport` já traz reconexão com backoff exponencial;
`SseTransport` cobre hosts que derrubam conexões longas. Trocar de um para outro
é uma variável de ambiente — **nenhum componente muda**.

O store (`realtime/store.ts`) é um external store consumido por
`useSyncExternalStore`, com o feed de atividade limitado a 60 eventos para manter
o DOM pequeno. O `LiveProvider` desconecta quando a aba vai para segundo plano.

### Dados por REST

`api/client.ts` expõe `servers`, `ranking`, `player`, `demos`, `demo`, `matches`,
`match`, `bans` e `stats`, todos com paginação e filtros. Com `VITE_API_URL`
definida, cada método vira um `fetch`; sem ela, resolve a partir dos dados
gerados com latência simulada — então os estados de carregando, vazio e erro são
reais desde o primeiro dia.

### Área administrativa

`/admin` roda em um shell próprio, com chrome diferente, gate de acesso e nenhum
acesso ao feed público. As ações (banir, remover banimento, expulsar, denúncias,
demos, configuração, log) já têm rota, validação, estado e confirmação — falta
apenas ligar o backend.

---

## Motion

GSAP faz o trabalho estrutural; Anime.js cuida das microinterações. Toda animação
passa por `useGsapScope`, que envolve `gsap.context` e reverte na desmontagem —
nenhum tween fica vivo depois que o componente sai.

| Momento | Como |
|---|---|
| Troca de página | A rota atual sai (150ms), só então a nova monta e escalona seus blocos `[data-enter]` (55ms de stagger). |
| Cards e listas | `opacity` + `translateY` + um leve blur que sai — cascata única, de cima para baixo. |
| Números | `useCountUp` escreve direto no `textContent`, sem re-render por quadro. |
| Mudança de valor ao vivo | `useValueFlash` — 140ms, uma propriedade, sem deslocamento de layout. |
| Morte no placar | Uma lavagem vermelha de 850ms na linha. É o único evento que interrompe o olho. |
| Reordenação do ranking | GSAP **Flip**: a geometria é capturada antes do filtro mudar e cada linha viaja até a nova posição. |
| Kill feed | Entra pela direita em 240ms, a mesma direção e o mesmo ritmo do jogo. |
| Radar | Traçado do abate desenhado por `stroke-dashoffset`, mais uma varredura de sensor em CSS puro. |
| Gráficos | Linha desenhada em 1,05s, barras crescendo a partir da base, revelação por `ScrollTrigger` na página de estatísticas. |
| Latão | Um único brilho diagonal no primeiro colocado do pódio. Uma vez, na montagem. |

Nada anima em laço a não ser dois indicadores de atividade (o pulso do status e a
varredura do radar), ambos em CSS e apenas em `transform`/`opacity`.

`prefers-reduced-motion` é respeitado no CSS **e** em JS: `prefersReducedMotion()`
é a fonte única de verdade, e cada hook aplica o estado final direto quando ela é
verdadeira.

---

## Responsividade

A hierarquia se adapta, os elementos não apenas encolhem.

- **Sidebar** → gaveta com overlay abaixo de `lg`; no desktop recolhe para um rail
  de 68px, com a preferência guardada em `localStorage`.
- **Barra de sinal** → mantém pulso, placar e cronômetro no celular; nome do
  servidor, mapa e fase saem primeiro.
- **Placar** → duas colunas no desktop, empilhado no celular, com assistências e
  ping ocultos quando não cabem.
- **Ranking e demos** → colunas secundárias somem por breakpoint; o pódio empilha
  com o primeiro colocado no topo.
- **Banimentos** → a linha vira nickname + estado; o resto abre no detalhe.

---

## Performance

- Divisão por rota com `React.lazy`; só a visão geral vai no chunk de entrada.
- Linhas do placar e do ranking memoizadas; contadores escrevem em `textContent`.
- Blips do radar interpolam por transição de CSS — nenhum quadro custa JS.
- O feed pausa quando a aba sai de foco.
- O buffer de atividade é limitado a 60 eventos.
- Avatares são SVG determinísticos gerados do nickname: nenhuma requisição de
  imagem, nenhum layout shift.

---

## Estados

Toda superfície que carrega dados sabe se mostrar em quatro situações:
carregando (`LoadingState` / `SkeletonRows`), sucesso, vazia (`EmptyState`, com
uma ação para sair dali) e erro (`ErrorState`, com o que houve e como tentar de
novo). Fora isso: `OfflineNotice` quando o feed pausa, e um toast para toda ação
que não muda a tela sozinha.

---

## Dados de demonstração

Tudo é derivado de um seed fixo (`data/seed.ts`), então o protótipo é idêntico a
cada recarga. Nicknames, mapas, armas, motivos de banimento e nomes de arquivo
`.dem` seguem o vocabulário real de CS:S — `de_dust2`, `awp`, `STEAM_0:1:20001017`,
`de_inferno_mt_2481_srv-02.dem`, `connect 177.54.148.20:27015`.

O botão **Conectar** copia o comando do console, que é o que um jogador realmente
cola no jogo — não só o IP.

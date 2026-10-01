# Prompt para colar em outro projeto

Copie tudo o que está entre as linhas e mande como uma mensagem só.

---

Quero que você construa, do zero, um plugin de SourceMod que **filtra contas
Steam no momento em que o jogador conecta** e derruba quem não atende aos
requisitos. Já tenho um plugin assim rodando em outra comunidade; abaixo está
tudo o que aprendi mantendo ele, inclusive os erros que só apareceram em
produção. Use isto como especificação, não como código para copiar.

## Antes de começar, me pergunte

1. Qual jogo e qual **appid** da Steam. (CS:S é 240. É o único ponto realmente
   específico do jogo — deixe num `#define` no topo.)
2. Onde está o compilador do SourceMod nesta máquina, e qual versão do
   SourceMod roda no servidor.
3. Se eu quero a gravação em MySQL ou só os logs.
4. Quais valores eu quero nos limites (horas mínimas, idade mínima da conta).

Se eu não responder alguma, use os padrões que estão no fim deste texto e me
avise qual assumiu.

## O que o plugin faz

Ataca o **custo de fabricar uma conta**, não a identidade. Banir por SteamID
não resolve — a pessoa cria outra em cinco minutos. Uma conta com 60 dias e 20
horas de jogo não se improvisa depois de um kick.

Quando alguém conecta, o plugin consulta a Steam Web API e barra na porta.

## Dependências

- **Extensão SteamWorks** (`https://github.com/KyleSanderson/SteamWorks`) — é
  ela que faz HTTP de dentro do servidor; o SourceMod sozinho não faz. Precisa
  do `.ext.so` **e** de um arquivo `.autoload` ao lado, em
  `addons/sourcemod/extensions/`. Sem o autoload a extensão não sobe e o
  plugin inteiro falha ao carregar, porque o `#include <SteamWorks>` vira
  nativa obrigatória.
- Uma **Steam Web API key** (grátis em `steamcommunity.com/dev/apikey`).
- MySQL só se eu pedir a gravação estruturada.

## As quatro perguntas

Cada critério é uma chamada GET separada, com a key na query string:

| # | endpoint | responde | campos |
|---|---|---|---|
| 1 | `ISteamUser/GetPlayerBans/v1` | tem VAC ou game ban? | `VACBanned`, `NumberOfVACBans`, `NumberOfGameBans`, `DaysSinceLastBan` |
| 2 | `ISteamUser/GetPlayerSummaries/v2` | idade da conta e visibilidade | `timecreated` (unix), `communityvisibilitystate` (**3 = público**) |
| 3 | `IPlayerService/IsPlayingSharedGame/v1` | jogo emprestado (Family Sharing)? | `lender_steamid` (string; **`"0"` = não emprestado**) |
| 4 | `IPlayerService/GetOwnedGames/v1` | horas no jogo | `playtime_forever` (em **minutos**) |

O appid entra em (3) como `appid_playing` e em (4) como `appids_filter[0]`.

**Só dispare a chamada se o critério estiver ligado.** Se o mínimo de horas
for 0, a chamada 4 nem sai — economiza cota da API.

## A arquitetura

O ponto difícil não é chamar a API: é que as quatro respostas voltam **fora de
ordem**, e o veredito só existe quando todas chegam. Faça um leque com
contador:

```
OnClientPostAdminCheck
  ├─ imune por flag de admin?  -> passa, sem chamada nenhuma
  ├─ está na whitelist?        -> passa, sem chamada nenhuma
  └─ dispara N chamadas, pendentes = N
                                   │
     cada callback ─── reprovou? ─→ chuta, e acabou
                   └── passou?  ─→ pendentes--, se chegou a 0: APROVADO
```

Três detalhes que importam:

- **Use `OnClientPostAdminCheck`, não `OnClientConnect`.** É o primeiro momento
  em que as flags de admin já foram carregadas.
- **Se o `GetClientAuthId` falhar, agende e tente de novo** (timer de ~2s). Ele
  falha nos primeiros instantes da conexão, e sem o retry quem entra com rede
  lenta passa sem ser checado.
- **A rejeição encerra, não decrementa.** As outras respostas ainda chegam, mas
  encontram o cliente fora. Todo callback começa com
  `if (client <= 0 || !IsClientInGame(client)) return;`.

## Fail-open, e isso é política

**Quando a chamada à Steam falha, o jogador entra.** O contrário faria uma
instabilidade da Valve esvaziar o servidor, o que é pior do que deixar entrar
uma conta duvidosa por alguns minutos.

Mas isso tem consequência operacional: um pico de "aprovado" pode significar
que a Steam estava fora, não que chegou gente boa. Então **cada falha escreve
uma linha própria de log** dizendo qual endpoint falhou e que o jogador entrou
sem ser checado.

**Deixe isso num cvar** em vez de fixo no código — foi o que faltou na versão
original.

## Whitelist e imunidade: dois mecanismos, propósitos diferentes

**Imunidade por flag de admin**: quem já é admin não é checado. Estrutural.

**Whitelist por SteamID64** em `configs/<plugin>_whitelist.cfg`: exceção
nominal, para o veterano com VAC antigo em outro jogo. Formato:

```
// comentário; ; também comenta
76561198069589368 motivo opcional depois do primeiro espaço
```

Carregue num `StringMap` no `OnPluginStart` **e no `OnMapStart`**, e crie um
comando de recarga para não depender da troca de mapa.

Três regras:

1. **Consulte a whitelist ANTES das chamadas**, não depois do veredito. O
   objetivo é não gastar cota com quem já está liberado.
2. **Linha inválida vai para o log com o número da linha.** Uma whitelist que
   engole erro em silêncio deixa o admin achando que liberou alguém que
   continua barrado.
3. **Valide o formato**: 17 dígitos começando em `765`. Pega o erro de colar
   um SteamID2 sem perceber.

> Por que a regra 2 existe: no meu servidor a whitelist ficou
> **silenciosamente desligada por semanas**. O arquivo estava lá, documentado,
> com gente dentro — mas o código que o lia sumiu numa cópia de servidor sobre
> o outro, e nada reclamava. **Registre no arranque quantas contas carregou.**
> Uma linha `Whitelist: 5 conta(s) liberada(s).` teria denunciado no primeiro
> restart.

## O contrato de log — trate como API pública

Escreva no log diário do SourceMod. Duas linhas são o contrato, porque outro
sistema (no meu caso um painel web) lê elas:

```
Bloqueado <jogador> - <motivo>
APROVADO: <jogador> passou em todas as checagens.
```

O `%L` do SourceMod já produz o bloco `<nick><userid><authid><time>`.

Todo o resto (diagnóstico por checagem, erros de API) é ruído que o consumidor
ignora. **Deixe um comentário no código avisando que mudar o texto dessas duas
linhas quebra o consumidor sem erro nenhum** — o feed do outro lado só fica
vazio.

Se eu pedir, adicione também uma linha de saída (`SAIU: ... ficou N min.`) com
duas sutilezas:
- **Só para quem realmente entrou.** Quem foi barrado também passa pelo
  disconnect, e logar ali contaria duas vezes o mesmo evento.
- **Use `GetTime()`, não `GetGameTime()`** — o segundo zera na troca de mapa e
  diria "0 min" para quem passou a tarde no servidor.

## Banco de dados (só se eu pedir)

Uma linha por checagem, escrita **uma vez só** por cliente (proteja com um
booleano, porque tanto a rejeição quanto a aprovação chamam a mesma função).

Colunas: `steam64`, `steam_id`, `nick`, `ip`, `verdict`
(`aprovado`/`bloqueado`/`erro_api`), `reason`, `hours`, `account_days`,
`visibility`, `vac_bans`, `game_bans`, `days_since_ban`, `lender_steam64`.

**Campo não coletado grava `NULL`, não `0`.** A diferença entre "tem zero
horas" e "não deu para saber as horas" é justamente o que se quer analisar
depois.

Use **prepared statements**. A versão original monta a query com `Format` e
escape manual; funciona, mas é frágil.

## Cvars

Referência do que uso hoje, adapte:

| cvar | padrão | efeito |
|---|---|---|
| `enabled` | 1 | liga/desliga |
| `apikey` | *(vazio)* | **precisa de `FCVAR_PROTECTED`**, senão vaza em `cvarlist` |
| `min_hours` | 20 | horas mínimas; 0 = não checa |
| `min_account_days` | 60 | idade mínima da conta; 0 = não checa |
| `block_vac` | 1 | barra VAC/game ban |
| `vac_days_grace` | 0 | libera ban mais velho que X dias; 0 = nunca |
| `block_shared` | 1 | barra Family Sharing |
| `immunity_flag` | b | flag de admin que passa direto |
| `db_config` | *(vazio)* | entrada do `databases.cfg`; vazio = sem banco |
| `kick_msg` | … | texto base do kick |
| `perfil_ilegivel` | barrar | o que fazer quando não dá para ler as horas |
| `api_falhou` | liberar | fail-open ou fail-closed quando a Steam cai |
| `cache_horas` | 6 | horas de validade do cache por SteamID64 |

Os três últimos são melhorias que quero desde o começo — explicadas abaixo.

## Melhorias que quero (a original não tem)

1. **Cache por SteamID64 com TTL.** O desenho gasta até 4 chamadas por
   conexão, e a cota da Steam é de ~100 mil por dia. Servidor cheio com gente
   reconectando chega perto à toa, e o resultado quase não muda entre uma
   conexão e a próxima. **É a melhoria mais importante.**
2. **Um cvar só para "perfil ilegível".** Na original há dois cvars que se
   sobrepõem — um para bloquear perfil privado e outro para exigir horas
   legíveis. Na prática o primeiro não faz o que o nome promete, porque o
   segundo barra a pessoa de qualquer jeito. Unifique.
3. **Fail-open configurável**, em vez de fixo no código.

## Armadilhas que já me custaram caro

- **`AutoExecConfig` manda mais que o código.** Depois do primeiro arranque, o
  `cfg/sourcemod/<plugin>.cfg` existe e é ele que vale; mudar o padrão no
  código não muda nada num servidor que já rodou. Ao depurar "o cvar não
  obedece", olhe o arquivo gerado antes do código.
- **Cvar duplicado no cfg gerado.** No meu, a `apikey` aparece duas vezes: o
  placeholder gerado e a key real colada no fim. Vale a última, então funciona
   — mas quem editar a primeira vai achar que mudou e não mudou.
- **Buffer temporário compartilhado no SourcePawn.** Chamar duas vezes, dentro
  do mesmo `Format`, uma função que devolve array pode fazer uma sobrescrever
  a outra. Escreva cada valor no seu próprio buffer antes de montar a string.
- **Um buffer global de resposta é seguro** com a SteamWorks, porque os
  callbacks são processados um por vez. Se trocar de mecanismo HTTP, revise.
- **Não puxe biblioteca de JSON.** Três funções que acham `"campo":valor` por
  busca de substring dão conta: os payloads da Steam são rasos e a consulta é
  sempre de um SteamID só. **Mas documente a limitação** — se o campo aparecer
  duas vezes, pega a primeira.
- **`playtime_forever` ausente é ambíguo**: pode ser perfil que esconde os
  jogos ou conta que não possui o jogo. A API não distingue. Não invente —
  trate como "não verificável" e deixe a política no cvar.

## O que quero de entrega

1. O `.sp` comentado **em português**, explicando o *porquê* das decisões, não
   o *o quê* do código.
2. Um `whitelist.cfg` de exemplo, com o formato documentado no cabeçalho.
3. O `schema.sql`, se eu tiver pedido o banco.
4. Um README curto com: como instalar a SteamWorks, como pegar a key, como
   ligar, e como testar.
5. **Compilado**, com os avisos do compilador zerados.
6. Dois comandos de admin: um para rodar o filtro manualmente num jogador
   (`<plugin>_check <alvo>`) e um para recarregar a whitelist. Valem mais do
   que parecem — sem eles, testar significa pedir para alguém conectar.

## Ordem de construção que eu sugiro

1. Esqueleto, cvars, `AutoExecConfig`, log de arranque.
2. **Uma chamada só** — a de bans — já com o leque e o contador no lugar. É o
   caminho inteiro em miniatura, e é onde os erros de arquitetura aparecem.
3. As outras três chamadas.
4. Whitelist, imunidade e cache.
5. As duas linhas do contrato de log.
6. Banco, se for o caso.
7. Os dois comandos de admin.

Me mostre o plano antes de escrever o código.

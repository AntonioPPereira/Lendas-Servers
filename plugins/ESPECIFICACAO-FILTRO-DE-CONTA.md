# Filtro de conta Steam no join — especificação para reconstruir

Documento para levar a **outro projeto** e construir um plugin equivalente ao
`lendas_steamfilter` que roda hoje no Servidor 01 da LENDAS.

Não é o código: é o que o código precisa fazer, por quê, e onde estão as
armadilhas que só aparecem depois de rodar em produção. Escrito depois de ler
o `.sp` inteiro (903 linhas), a configuração viva do servidor, a whitelist em
uso e o consumidor do log no backend.

---

## 1. O problema que o plugin resolve

Servidor público de CS:S enche de conta descartável: recém-criada, sem horas
no jogo, com VAC ban, ou rodando o jogo emprestado por Family Sharing. Banir
por SteamID não adianta — a pessoa cria outra conta em cinco minutos.

A ideia é atacar o **custo de fabricar uma conta nova**, não a identidade. Uma
conta com 60 dias e 20 horas de jogo não se improvisa depois de um kick.

O plugin decide na porta: quando alguém conecta, ele pergunta à Steam Web API
quem é aquela conta e derruba antes de a pessoa jogar.

## 2. Dependências

| item | por quê |
|---|---|
| **SourceMod** 1.11+ | `Database`, `StringMap`, sintaxe nova |
| **Extensão SteamWorks** | é ela que faz HTTP de dentro do servidor; o SourceMod sozinho não faz |
| **Steam Web API key** | grátis em `steamcommunity.com/dev/apikey` |
| MySQL (opcional) | só para a gravação estruturada; o plugin funciona sem |

A SteamWorks precisa do `.ext.so` **e** do arquivo `.autoload` ao lado, na
pasta `addons/sourcemod/extensions/`. Sem o autoload ela não sobe e o plugin
falha ao carregar inteiro, porque o `#include <SteamWorks>` vira nativa
obrigatória.

## 3. As quatro perguntas

Cada critério é uma chamada HTTP separada. Todas GET, todas com a key na
query string.

| # | endpoint | responde | campo que importa |
|---|---|---|---|
| 1 | `ISteamUser/GetPlayerBans/v1` | tem VAC ou game ban? | `VACBanned`, `NumberOfVACBans`, `NumberOfGameBans`, `DaysSinceLastBan` |
| 2 | `ISteamUser/GetPlayerSummaries/v2` | quantos dias tem a conta? o perfil é público? | `timecreated` (unix), `communityvisibilitystate` (**3 = público**) |
| 3 | `IPlayerService/IsPlayingSharedGame/v1` | o jogo é emprestado? | `lender_steamid` (string; **`"0"` = não é emprestado**) |
| 4 | `IPlayerService/GetOwnedGames/v1` | quantas horas no jogo? | `playtime_forever` (em **minutos**) |

O `appid` do jogo entra em (3) como `appid_playing` e em (4) como
`appids_filter[0]`. **É o único ponto realmente específico do jogo** — deixe-o
num `#define` no topo. CS:S é 240.

Só dispara a chamada se o critério correspondente estiver ligado. Se
`lsf_min_hours` for 0, a chamada 4 nem sai — economiza cota da API.

## 4. A arquitetura, e por que ela é assim

O ponto difícil não é chamar a API: é que **quatro respostas voltam fora de
ordem, cada uma no seu tempo**, e o veredito só existe quando todas chegam.

O desenho é um leque com contador:

```
OnClientPostAdminCheck
  ├─ imune por flag de admin?  -> passa, sem chamada nenhuma
  ├─ está na whitelist?        -> passa, sem chamada nenhuma
  └─ dispara N chamadas, pending = N
                                   │
     cada callback ─── reprovou? ─→ KickClient, e acabou
                   └── passou?  ─→ pending--,  se chegou a 0: APROVADO
```

Três decisões dentro disso:

**O gancho é `OnClientPostAdminCheck`, não `OnClientConnect`.** É o primeiro
momento em que as flags de admin já foram carregadas — antes disso não dá para
saber se a pessoa é imune, e o SteamID pode ainda não ter autenticado.

**Se o SteamID ainda não está pronto, agenda e tenta de novo.** O
`GetClientAuthId` falha nos primeiros instantes da conexão. Um timer de 2
segundos que rechama resolve. Sem isso, quem entra com a rede lenta passa sem
ser checado.

**A rejeição não decrementa o contador — ela encerra.** Assim que um critério
reprova, chuta e para. As outras respostas ainda vão chegar, mas encontram o
cliente fora e desistem sozinhas. Todo callback começa com
`if (client <= 0 || !IsClientInGame(client)) return;`.

## 5. Fail-open: a decisão de política mais importante

**Quando a chamada à Steam falha, o jogador entra.**

Isso é escolha deliberada, não descuido. A alternativa — fail-closed — faria
uma instabilidade da Steam esvaziar o servidor inteiro, e isso é pior do que
deixar entrar uma conta duvidosa por alguns minutos. A Steam Web API cai com
alguma frequência.

Consequência que precisa estar clara para quem opera: **um pico de "APROVADO"
sem as linhas de diagnóstico junto significa que a Steam estava fora**, não
que chegou gente boa. Por isso cada falha escreve uma linha própria
(`ERRO API: <endpoint> falhou ... LIBERADO sem checar`) e um veredito
`erro_api` no banco — dá para separar "passou na checagem" de "passou porque
não deu para checar".

Se for reconstruir, **exponha isso num cvar** em vez de deixar fixo no código.
Foi o que faltou na versão original.

## 6. Whitelist e imunidade — dois mecanismos, propósitos diferentes

**Imunidade por flag de admin** (`lsf_immunity_flag`, hoje `b`): quem já é
admin não é checado. É estrutural, muda pouco.

**Whitelist por SteamID64** (`configs/lsf_whitelist.cfg`): exceção nominal,
para o veterano com VAC de 2017 em outro jogo, ou o amigo de conta nova.
Formato:

```
// comentário; ; também comenta
76561198069589368 NEGODOY - conta de 2012, sem VAC, liberado a pedido em 2026-09-04
```

Um ID por linha, motivo opcional depois do primeiro espaço. Carregada num
`StringMap` (chave = ID, presença = liberado) no `OnPluginStart` **e no
`OnMapStart`**, mais um comando `sm_lsf_reload` para não ter de esperar a
troca de mapa.

Três regras que valem a pena copiar:

1. **A whitelist é consultada ANTES das chamadas, não depois do veredito.** O
   objetivo dela é não gastar cota de API com quem já está liberado. Checar
   primeiro e ignorar o resultado depois funcionaria, mas desperdiça quatro
   chamadas por conexão.
2. **Linha inválida vai para o log de erro, com o número da linha.** Uma
   whitelist que engole erro em silêncio deixa o admin achando que liberou
   alguém que continua sendo barrado.
3. **Valide o formato**: 17 dígitos começando em `765`. Barato, e pega o erro
   de colar um SteamID2 (`STEAM_0:1:...`) sem perceber.

> **História que justifica o item 2**: neste servidor a whitelist ficou
> **silenciosamente desligada por semanas**. O arquivo existia, documentado,
> com gente dentro — mas o código que o lia sumiu numa cópia de servidor sobre
> o outro. O `.smx` encolheu de 16607 para 13598 bytes e ninguém notou, porque
> nada reclamava. Quem estava na lista continuou sendo barrado.
>
> **Lição para o projeto novo**: no arranque, registre no log quantas contas
> foram carregadas. Uma linha `Whitelist: 5 conta(s) liberada(s).` teria
> denunciado o problema no primeiro restart.

## 7. O contrato de log — trate como API pública

O plugin escreve no log diário do SourceMod
(`addons/sourcemod/logs/L<AAAAMMDD>.log`), e **outro sistema lê essas linhas**.
No nosso caso o painel web monta o feed de atividade a partir daí, por SFTP,
sem banco nenhum.

Duas linhas são o contrato:

```
Bloqueado <nick><userid><authid><time> - <motivo>
APROVADO: <nick><userid><authid><time> passou em todas as checagens.
```

O `%L` do SourceMod produz esse `<nick><userid><authid><time>` sozinho.

Tudo o mais (`[bans]`, `[perfil]`, `[horas]`, `[shared]`, `ERRO API:`) é
diagnóstico e o consumidor ignora. As regex do lado de fora ancoram em `^` e
no `$` para não casar com linha parecida.

Se mexer no texto dessas duas linhas, **quebra o consumidor sem erro nenhum** —
o feed só fica vazio. Vale um comentário no código dizendo isso.

Há ainda uma terceira linha, opcional mas útil, escrita no `OnClientDisconnect`:

```
SAIU: <jogador> ficou <N> min.
```

Ela fecha o ciclo entrou → saiu no feed. Duas sutilezas:

- **Só loga quem realmente entrou.** Quem foi barrado também passa pelo
  disconnect (o kick é um disconnect), e logar ali mostraria "Bloqueado"
  seguido de "Saiu" para a mesma pessoa — contando duas vezes o que aconteceu
  uma vez. Guarde o instante da aprovação e só logue se ele existir.
- **Use `GetTime()`, não `GetGameTime()`.** O segundo zera a cada troca de
  mapa e diria "ficou 0 min" para quem passou a tarde no servidor.

## 8. Gravação no banco (opcional)

Uma linha por checagem, escrita **uma vez só** por cliente — protegida por um
booleano `jaEscreveu`, porque tanto a rejeição quanto a aprovação chamam a
mesma função.

Colunas: `steam64`, `steam_id`, `nick`, `ip`, `verdict`
(`aprovado`/`bloqueado`/`erro_api`), `reason`, `hours_css`, `account_days`,
`visibility`, `vac_bans`, `game_bans`, `days_since_ban`, `lender_steam64`.

Campo não coletado grava `NULL`, não `0` — a diferença entre "tem zero horas"
e "não deu para saber as horas" é justamente o que se quer analisar depois.

Ligado por `lsf_db_config` (nome da entrada no `databases.cfg`); vazio =
desligado. **Hoje está desligado em produção** e o painel vive só dos logs — a
decisão foi que ativar exigiria criar usuário de banco e reiniciar os
servidores, para obter a mesma informação que o log já dá de graça.

Se for reconstruir e quiser o banco: **use prepared statements**. A versão
original monta a query com `Format` e `Escape`, o que funciona mas é frágil.

## 9. Cvars

Valores de produção do Servidor 01 hoje:

| cvar | valor | efeito |
|---|---|---|
| `lsf_enabled` | 1 | liga/desliga tudo |
| `lsf_apikey` | *(a key)* | **`FCVAR_PROTECTED`**, senão vaza em `cvarlist` |
| `lsf_min_hours` | 20 | horas mínimas no jogo; 0 = não checa |
| `lsf_min_account_days` | 60 | idade mínima da conta; 0 = não checa |
| `lsf_block_vac` | 1 | barra VAC/game ban |
| `lsf_vac_days_grace` | 0 | libera ban mais velho que X dias; 0 = nunca |
| `lsf_block_private` | **0** | perfil privado; hoje **não** barra |
| `lsf_block_shared` | 1 | barra Family Sharing |
| `lsf_require_owned` | 1 | barra quando não dá para ler as horas |
| `lsf_immunity_flag` | b | flag de admin que passa direto |
| `lsf_db_config` | *(vazio)* | entrada do `databases.cfg`; vazio = sem banco |
| `lsf_kick_msg` | … | texto base do kick |

Repare na combinação `block_private 0` + `require_owned 1`: perfil privado não
é barrado por ser privado, mas acaba barrado do mesmo jeito quando as horas
não podem ser lidas. **Dois cvars que se sobrepõem** — no projeto novo,
prefira um só, tipo `lsf_perfil_ilegivel` com valores
`liberar` / `barrar`.

## 10. Armadilhas que custaram caro

**`AutoExecConfig` manda mais que o código.** Depois do primeiro arranque, o
`cfg/sourcemod/<plugin>.cfg` existe e é ele que vale. Mudar o padrão no
código **não muda nada** num servidor que já rodou. Ao depurar "o cvar não
obedece", olhe o arquivo gerado antes de olhar o código.

**Cvar duplicado no cfg gerado.** O arquivo do Servidor 01 tem `lsf_apikey`
duas vezes: o placeholder que o plugin gerou e a key real colada no fim. Vale
a última, então funciona — mas é uma bomba-relógio: quem editar a primeira vai
achar que mudou e não mudou.

**Buffer temporário compartilhado no SourcePawn.** Chamar duas vezes, dentro
do mesmo `Format`, uma função que devolve array pode fazer uma sobrescrever a
outra. Escreva cada valor no seu próprio buffer antes de montar a query.

**Buffer de resposta global é seguro aqui.** Os callbacks do SteamWorks são
processados um por vez, então um único buffer global de resposta dá conta e
evita alocação. Isso é uma propriedade da extensão — se mudar de mecanismo
HTTP, revise.

**O "parser" de JSON é proposital.** São três funções que acham
`"campo":valor` por busca de substring. Não é um parser, e não precisa ser:
os payloads da Steam são rasos e a consulta é sempre de um SteamID só. Puxar
uma biblioteca de JSON para isso seria peso sem retorno. **Mas documente a
limitação**: se o campo aparecer duas vezes no payload, ele pega a primeira.

**`playtime_forever` ausente é ambíguo.** Pode ser perfil que esconde os
jogos, ou conta que não possui o jogo. A API não distingue. Não invente: trate
como "não verificável" e deixe a política num cvar.

**Cota da Steam Web API.** São ~100 mil chamadas por dia por key, e este
desenho gasta **até 4 por conexão**. Servidor cheio com gente reconectando
chega perto. **No projeto novo, adicione um cache por SteamID64 com TTL de
algumas horas** — o resultado quase não muda entre uma conexão e a próxima. É
a melhoria que eu faria primeiro.

## 11. Ordem de construção sugerida

1. Esqueleto do plugin, cvars, `AutoExecConfig`, log de arranque.
2. Uma chamada só — a de bans — com o leque e o contador já no lugar. É o
   caminho inteiro em miniatura.
3. As outras três chamadas.
4. Whitelist e imunidade.
5. As duas linhas do contrato de log.
6. Banco, se for querer.
7. `sm_lsf_check <alvo>` para testar num jogador sem esperar alguém conectar,
   e `sm_lsf_reload` para a whitelist.

Os dois comandos de admin do item 7 valem mais do que parecem: sem eles, testar
o filtro significa pedir para alguém entrar no servidor.

## 12. Segurança

- `lsf_apikey` **precisa** de `FCVAR_PROTECTED`. Sem isso ela aparece para
  qualquer um que rode `cvarlist` ou leia o `status`.
- A key mora em texto puro no `cfg/sourcemod/`. É o normal em SourceMod, mas
  significa que **qualquer backup ou cópia de pasta leva a key junto** — foi
  assim que ela apareceu numa cópia local aqui.
- A key é de leitura pública da Steam: quem a rouba consulta perfis em seu
  nome e queima sua cota. Rotacionar é gratuito e leva um minuto.

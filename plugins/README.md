# Plugins do servidor de jogo

Fontes (`.sp`) dos plugins SourceMod que o site depende. Eles **não rodam
aqui** — rodam no servidor de CS:S — mas moram neste repositório de
propósito.

## Por que estão versionados aqui

Em 29/08/2026 o conteúdo do Servidor 02 foi copiado por cima do Servidor 01.
Entre outras coisas, isso **substituiu o `lendas_demos.smx` por uma versão
antiga** que só organizava a pasta e nunca chamava `tv_record`. O servidor
ficou dois dias sem gravar nenhuma demo, e **o fonte da versão que gravava
não existia em lugar nenhum** — nem no servidor, nem em backup, nem na
máquina de ninguém. Só restou reescrever do zero.

Binário compilado não é fonte. Enquanto o `.sp` só existir numa pasta solta,
uma cópia errada apaga o trabalho de vez. É esse o motivo desta pasta.

## O que tem aqui

| arquivo | o que faz | de onde o site consome |
| --- | --- | --- |
| `lendas_demos.sp` | Grava a demo do SourceTV por mapa em `demos/AAAA-MM/`, no formato de nome que o backend exige | `GET /api/demos` |
| `lendas_bans.sp` | Exporta os bans do SourceBans++ pra um JSON dentro do servidor | `GET /api/bans` |
| `lendas_players.sp` | Mantém o índice `nick -> SteamID64` que permite avatar real no ranking | `GET /api/ranking`, `GET /api/players` |
| `lendas_playerstats.sp` | Conta abates por arma, headshots e bombas de cada jogador | `GET /api/stats/leaderboards` |

Cada um explica no próprio cabeçalho **por que** foi feito daquele jeito —
principalmente as decisões que não são óbvias (o atraso antes de gravar, a
escrita atômica do JSON, o `utf8mb4`). Vale ler antes de mexer.

## Modo minigame (`lendas_mg`)

Os arquivos ficam em `lendas_mg/`, e não só o `.sp`: as **configurações
fazem parte do plugin**. Um sem o outro não funciona, e config solta no
servidor foi exatamente o que se perdeu no incidente de 29/08.

| arquivo | vai para |
| --- | --- |
| `lendas_mg.sp` | compilado em `addons/sourcemod/plugins/lendas_mg.smx` |
| `lendas_mg/mg_on.cfg` | `cfg/lendas/mg_on.cfg` |
| `lendas_mg/mg_off.cfg` | `cfg/lendas/mg_off.cfg` |
| `lendas_mg/lendas_mg_maps.cfg` | `addons/sourcemod/configs/lendas_mg_maps.cfg` |

O desenho é o mesmo do `!mix`: um cfg ao entrar no modo, outro ao sair. A
diferença é o gatilho — aqui é o nome do mapa, não um comando.

**A parte que não é óbvia** é o cfg de saída. Nenhum cvar de movimento
aparece no `server.cfg`, então a troca de mapa não desfaz o bunnyhop
sozinha; sem o `mg_off.cfg` o servidor sairia do minigame com o movimento
alterado no meio do mix seguinte. E ele só roda quando o modo estava mesmo
ligado: em mapa comum o plugin não escreve um cvar sequer.

Para acrescentar um mapa ao modo basta editar `lendas_mg_maps.cfg` no
servidor — o plugin relê o arquivo a cada troca de mapa, sem reload.

## Compilar

O compilador tem que ser da **mesma versão do SourceMod que roda no
servidor** — hoje `1.12.0.7246`. Plugin compilado numa versão mais nova que o
servidor **não carrega** ("code version is too new"), que foi exatamente o
que quebrou os plugins padrão durante o incidente.

```bash
spcomp64 -i<sdk>/addons/sourcemod/scripting/include \
         -o lendas_demos.smx \
         lendas_demos.sp
```

O `.smx` gerado vai pra `cstrike/addons/sourcemod/plugins/` do servidor, e
depois `sm plugins reload <nome>` no console. Trocar núcleo ou extensão do
SourceMod exige reiniciar o processo, não só recarregar o plugin.

Os `.smx` **não** são versionados: são binários derivados, e guardá-los aqui
convidaria justamente a confusão de "qual build é essa?" que já custou caro.

## Ainda fora daqui

`lendas_live`, `lendas_steamfilter` e `lendas_firenade` continuam com o fonte
apenas em pasta solta na máquina do administrador. Correm o mesmo risco e
deveriam vir pra cá.

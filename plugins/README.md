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
| `lendas_mg/mg_surf.cfg` | `cfg/lendas/mg_surf.cfg` |
| `lendas_mg/mg_combo.cfg` | `cfg/lendas/mg_combo.cfg` |
| `lendas_mg/mg_off.cfg` | `cfg/lendas/mg_off.cfg` |
| `lendas_mg/lendas_mg_maps.cfg` | `addons/sourcemod/configs/lendas_mg_maps.cfg` |

O desenho é o mesmo do `!mix`: um cfg ao entrar no modo, outro ao sair. A
diferença é o gatilho — aqui é o nome do mapa, não um comando.

**A parte que não é óbvia** é o cfg de saída. Nenhum cvar de movimento
aparece no `server.cfg`, então a troca de mapa não desfaz o bunnyhop
sozinha; sem o `mg_off.cfg` o servidor sairia do minigame com o movimento
alterado no meio do mix seguinte. E ele só roda quando o modo estava mesmo
ligado: em mapa comum o plugin não escreve um cvar sequer.

**Perfis por família de mapa.** A segunda coluna do `lendas_mg_maps.cfg`
escolhe qual cfg roda:

| perfil | cfg | `sv_airaccelerate` | para |
| --- | --- | --- | --- |
| (vazio) | `mg_on.cfg` | 1000 | minigame e bhop |
| `surf` | `mg_surf.cfg` | 150 | rampa |
| `combo` | `mg_combo.cfg` | 300 | mapa com rampa **e** bhop |

O `sv_airaccelerate` **não é uma chave** surf-ou-bhop: é o quanto se ganha de
velocidade estrafando no ar. Com `sv_enablebunnyhopping` ligado o bhop
funciona em 150 também, só acelera mais devagar, e o surf funciona em 1000, só
fica fácil demais. Mapa misto por isso não fica sem saída — ele quer um valor
no meio, que é o `combo`.

Perfil novo é criar `cfg/lendas/mg_<nome>.cfg` e citar `<nome>` na lista; o
`mg_off.cfg` desfaz qualquer um deles, então não precisa de par.

**A ordem da lista importa e pega todo mundo**: a primeira linha que casar
ganha, e o resto nem é olhado. Exceção por mapa tem de ficar **acima** dos
curingas — escrita depois de `mg_*`, um mapa `mg_qualquercoisa` perderia para
o curinga e rodaria o perfil errado sem nenhum aviso. Por isso o arquivo tem
uma seção de exceções no topo, e o teste exercita os dois sentidos.

Para acrescentar um mapa ao modo basta editar `lendas_mg_maps.cfg` no
servidor — o plugin relê o arquivo a cada troca de mapa, sem reload.

**Todo cvar das cfg foi conferido dentro do `server_srv.so` do servidor.**
Isso não é zelo excessivo: cvar que não existe o CS:S ignora sem reclamar, e
a configuração fica com cara de certa sem fazer nada. Foi assim que o
`sv_full_alltalk` saiu daqui (está no `server.cfg` da casa, mas não existe no
binário) e que os cvars de stamina do CS:GO nem chegaram a entrar.

## Downloads do conteúdo customizado (`lendas_downloads`)

| arquivo | vai para |
| --- | --- |
| `lendas_downloads.sp` | compilado em `addons/sourcemod/plugins/lendas_downloads.smx` |
| `lendas_downloads/lendas_downloads.cfg` | `addons/sourcemod/configs/lendas_downloads.cfg` |

Existe por causa de um sintoma concreto: as skins do `lendas_vip` apareciam
como **ERROR** para todo mundo. O plugin do VIP chama `PrecacheModel` e
`SetEntityModel` — o servidor carrega e veste — mas **não chama
`AddFileToDownloadsTable`**, então o cliente nunca é avisado de que existe o
que baixar. Os arquivos estavam no servidor e no FastDL o tempo todo; faltava
o convite. Descoberto lendo os 51 natives do `.smx` dele, que não tem fonte.

**A lista é mínima de propósito.** A pasta `materials/models/gfl2_charolic`
tem 73 arquivos e 257 MB, mas o modelo usa 9 materiais. Mandar a pasta
inteira faria cada jogador baixar 257 MB de textura de roupa que o modelo nem
tem. A lista saiu de ler o que cada `.mdl` pede (o caminho fica gravado
dentro dele) e o que cada `.vmt` referencia: dá 51 arquivos, 53,8 MB.

**Maiúscula importa.** O servidor é Linux e os nomes na lista são os do
disco, não os que o `.vmt` pede — o `wheelchair01.vtf` está em minúscula no
disco e o material pede `WheelChair01`.

O plugin avisa no log quando um arquivo da lista não existe. Isso não é
zelo: `AddFileToDownloadsTable` aceita caminho inexistente calado, e o erro
só apareceria como mais um ERROR no lugar do boneco.

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

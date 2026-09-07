# Rodízio do Servidor 02 (minigame)

`mapcycle.servidor02.txt` vai para `cstrike/cfg/mapcycle.txt` **no Servidor
02** (`104.234.65.243:27490`), que deixou de ser de mix.

## Por que este arquivo governa mais do que parece

No `addons/sourcemod/configs/maplists.cfg`, tanto o `mapchooser` (votação no
fim do mapa) quanto o `nominations` (`!nominate`) apontam para `default`, que
por sua vez aponta para o `mapcyclefile`. Ou seja: **este arquivo decide o
rodízio E o que pode ser votado**. Mexer nele muda as duas coisas de uma vez —
e é por isso que não foi preciso criar lista separada para votação.

O menu de admin (`!maps`) é outra história: ele lê o
`adminmenu_maplist.ini`, que continua com todos os mapas. Então admin segue
podendo pôr qualquer mapa, inclusive os competitivos, mesmo que eles não
estejam no rodízio nem na votação.

## Sem comentários dentro do arquivo, de propósito

O `mapcycle.txt` é lido pela engine, não só pelo SourceMod. O parser do
SourceMod entende `//`, mas o da engine é outro e uma linha de comentário
poderia virar tentativa de carregar um mapa chamado `//`. Como o custo de
errar é o servidor tropeçar na troca de mapa, a explicação mora aqui e o
arquivo lá fica só com nomes.

## A ordem não é alfabética

Os mapas pesados estão espalhados de propósito, com os leves entre eles: o
`army_bridge` sozinho tem 243 MB e o `mg_tower_defense_source_v1` tem 79 MB.
Dois pesos seguidos fariam quem acabou de entrar baixar dois mapas grandes em
sequência. Todos estão no FastDL, então o download é rápido, mas espaçar não
custa nada.

## O que ficou de fora

`aim_*`, `ar_pond` e `tr_MWII` não entraram no rodízio: são de treino de mira,
não de minigame. Continuam instalados e disponíveis pelo menu de admin. Para
trazê-los ao rodízio e à votação, basta acrescentar o nome neste arquivo.

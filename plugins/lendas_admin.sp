#pragma semicolon 1
#pragma newdecls required

#include <sourcemod>
#include <cstrike>
// ForcePlayerSuicide mora aqui, não no core.
#include <sdktools>

#define PLUGIN_VERSION "1.0.0"

/**
 * Comandos básicos de admin que sumiram junto com o mix.
 *
 * POR QUE ESTE PLUGIN EXISTE
 *
 * O `!spec fulano`, `!ct`, `!tr` e `!rr` não eram do SourceMod: vinham do
 * **abnermix**, que também trazia o `!mix` inteiro. Ao transformar o Servidor
 * 02 em minigame o abnermix foi desligado, e junto foram embora comandos que
 * não têm nada a ver com mix e que o admin usa todo dia.
 *
 * Aqui estão só eles, sem nada de partida. O plugin serve nos dois
 * servidores: no 01 ele convive com o abnermix, porque registra apenas os
 * nomes que o outro não usa mais... e se um dia houver choque, o SourceMod
 * avisa no log em vez de escolher em silêncio.
 *
 * DECISÃO SOBRE COMO MOVER
 *
 * Trocar de time em CS:S tem dois caminhos. O `ChangeClientTeam` é bruto:
 * mexe no time sem avisar o jogo, o que deixa o placar e o estado do round
 * desencontrados. O `CS_SwitchTeam` é o que o próprio jogo usa, e é o
 * escolhido aqui.
 *
 * Para o espectador, porém, o `CS_SwitchTeam` sozinho deixaria o corpo vivo
 * no mapa. Por isso quem vai para o espectador estando vivo morre primeiro —
 * é o mesmo comportamento de qualquer servidor, e evita o boneco parado
 * fazendo cobertura para o time.
 */
public Plugin myinfo =
{
    name = "[LENDAS] Comandos de Admin",
    author = "LENDAS / Codex",
    description = "Devolve !spec, !ct, !tr, !swap e !rr sem depender do plugin de mix.",
    version = PLUGIN_VERSION,
    url = ""
};

public void OnPluginStart()
{
    CreateConVar("lendas_admin_version", PLUGIN_VERSION,
        "Versão do [LENDAS] Comandos de Admin.", FCVAR_NOTIFY | FCVAR_DONTRECORD);

    RegAdminCmd("sm_spec", Cmd_Spec, ADMFLAG_GENERIC,
        "sm_spec <alvo> - manda para o espectador.");
    RegAdminCmd("sm_ct", Cmd_Ct, ADMFLAG_GENERIC,
        "sm_ct <alvo> - manda para os Contra-Terroristas.");
    RegAdminCmd("sm_tr", Cmd_Tr, ADMFLAG_GENERIC,
        "sm_tr <alvo> - manda para os Terroristas.");
    RegAdminCmd("sm_t", Cmd_Tr, ADMFLAG_GENERIC,
        "sm_t <alvo> - o mesmo que sm_tr.");
    RegAdminCmd("sm_swap", Cmd_Swap, ADMFLAG_GENERIC,
        "sm_swap <alvo> - troca o jogador para o time oposto.");
    RegAdminCmd("sm_allspec", Cmd_AllSpec, ADMFLAG_BAN,
        "sm_allspec - manda TODO MUNDO para o espectador.");
    RegAdminCmd("sm_rr", Cmd_Rr, ADMFLAG_GENERIC,
        "sm_rr - reinicia o round.");
}

/**
 * Resolve o alvo e aplica a mudança de time.
 *
 * `ProcessTargetString` é o que faz `!spec fulano` aceitar nome parcial,
 * `@all`, `@ct`, `@me` e companhia — a mesma sintaxe do resto do SourceMod.
 * Escrever uma busca por nome à mão daria menos, e diferente do que o admin
 * já conhece.
 */
void MoverPara(int client, int args, int time, const char[] verbo)
{
    if (args < 1)
    {
        ReplyToCommand(client, "[LENDAS] Uso: sm_%s <jogador>", verbo);
        return;
    }

    char alvoTexto[64];
    GetCmdArg(1, alvoTexto, sizeof(alvoTexto));

    char nomeAlvo[MAX_TARGET_LENGTH];
    int alvos[MAXPLAYERS];
    bool ehML;

    int quantos = ProcessTargetString(alvoTexto, client, alvos, sizeof(alvos),
        COMMAND_FILTER_NO_IMMUNITY, nomeAlvo, sizeof(nomeAlvo), ehML);

    if (quantos <= 0)
    {
        ReplyToTargetError(client, quantos);
        return;
    }

    int movidos = 0;
    for (int i = 0; i < quantos; i++)
    {
        if (Mover(alvos[i], time))
        {
            movidos++;
        }
    }

    if (movidos == 0)
    {
        ReplyToCommand(client, "[LENDAS] Ninguém foi movido (já estavam lá?).");
        return;
    }

    // ShowActivity2 respeita o sm_show_activity: os outros admins veem quem
    // fez o quê, sem o servidor virar mural para o jogador comum.
    ShowActivity2(client, "[LENDAS] ", "%s %s.", verbo, nomeAlvo);
    LogAction(client, -1, "\"%L\" usou %s em %s (%d jogador(es))",
        client, verbo, nomeAlvo, movidos);
}

bool Mover(int alvo, int time)
{
    if (alvo <= 0 || !IsClientInGame(alvo) || GetClientTeam(alvo) == time)
    {
        return false;
    }

    // Vivo indo para o espectador precisa morrer primeiro, senão o corpo
    // fica de pé no mapa dando cobertura ao time.
    if (time == CS_TEAM_SPECTATOR && IsPlayerAlive(alvo))
    {
        ForcePlayerSuicide(alvo);
    }

    CS_SwitchTeam(alvo, time);
    return true;
}

public Action Cmd_Spec(int client, int args)
{
    MoverPara(client, args, CS_TEAM_SPECTATOR, "mandou para o espectador");
    return Plugin_Handled;
}

public Action Cmd_Ct(int client, int args)
{
    MoverPara(client, args, CS_TEAM_CT, "mandou para os CT");
    return Plugin_Handled;
}

public Action Cmd_Tr(int client, int args)
{
    MoverPara(client, args, CS_TEAM_T, "mandou para os TR");
    return Plugin_Handled;
}

public Action Cmd_Swap(int client, int args)
{
    if (args < 1)
    {
        ReplyToCommand(client, "[LENDAS] Uso: sm_swap <jogador>");
        return Plugin_Handled;
    }

    char alvoTexto[64];
    GetCmdArg(1, alvoTexto, sizeof(alvoTexto));

    char nomeAlvo[MAX_TARGET_LENGTH];
    int alvos[MAXPLAYERS];
    bool ehML;
    int quantos = ProcessTargetString(alvoTexto, client, alvos, sizeof(alvos),
        COMMAND_FILTER_NO_IMMUNITY, nomeAlvo, sizeof(nomeAlvo), ehML);

    if (quantos <= 0)
    {
        ReplyToTargetError(client, quantos);
        return Plugin_Handled;
    }

    int trocados = 0;
    for (int i = 0; i < quantos; i++)
    {
        int time = GetClientTeam(alvos[i]);
        // Só quem está jogando tem "time oposto". Espectador fica de fora.
        if (time == CS_TEAM_T && Mover(alvos[i], CS_TEAM_CT)) trocados++;
        else if (time == CS_TEAM_CT && Mover(alvos[i], CS_TEAM_T)) trocados++;
    }

    if (trocados == 0)
    {
        ReplyToCommand(client, "[LENDAS] Ninguém trocou (espectador não tem lado oposto).");
        return Plugin_Handled;
    }

    ShowActivity2(client, "[LENDAS] ", "trocou de time %s.", nomeAlvo);
    LogAction(client, -1, "\"%L\" trocou o time de %s (%d)", client, nomeAlvo, trocados);
    return Plugin_Handled;
}

/**
 * Manda todo mundo para o espectador.
 *
 * Pede flag mais alta que os outros de propósito: é o único aqui que mexe em
 * TODOS de uma vez, e um dedo errado esvazia o jogo.
 */
public Action Cmd_AllSpec(int client, int args)
{
    int movidos = 0;
    for (int i = 1; i <= MaxClients; i++)
    {
        if (IsClientInGame(i) && !IsFakeClient(i) && Mover(i, CS_TEAM_SPECTATOR))
        {
            movidos++;
        }
    }

    ShowActivity2(client, "[LENDAS] ", "mandou todos para o espectador (%d).", movidos);
    LogAction(client, -1, "\"%L\" usou sm_allspec (%d jogadores)", client, movidos);
    return Plugin_Handled;
}

public Action Cmd_Rr(int client, int args)
{
    ServerCommand("mp_restartgame 1");
    ShowActivity2(client, "[LENDAS] ", "reiniciou o round.");
    LogAction(client, -1, "\"%L\" usou sm_rr", client);
    return Plugin_Handled;
}

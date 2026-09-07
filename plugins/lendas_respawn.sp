#pragma semicolon 1
#pragma newdecls required

#include <sourcemod>
#include <sdktools>
#include <cstrike>

#define PLUGIN_VERSION "1.0.0"

/**
 * `!r` — renascer no começo do percurso, quando quiser.
 *
 * POR QUE ISTO EXISTE, E POR QUE NÃO É UMA PUNIÇÃO
 *
 * Vários mapas de percurso dão proteção ao nascer, e o pessoal descobriu que
 * indo ao espectador e voltando renasce com a proteção nova. Isso parece um
 * abuso a punir, e a primeira versão deste trabalho foi exatamente uma
 * punição — escrita e jogada fora.
 *
 * O dono do servidor apontou o que estava errado na ideia: **nem todo mundo
 * sabe o truque do espectador**. Punir teria mantido o mundo dividido entre
 * quem sabe e quem não sabe, só que com o lado que sabe agora sendo punido.
 * Transformar em comando acaba com a divisão pelo outro lado: todo mundo
 * renasce, ninguém precisa de truque, e a coisa deixa de ser vantagem.
 *
 * O QUE ELE NÃO FAZ
 *
 * Não devolve vida a quem morreu no meio de uma disputa — respawn é do mapa
 * de percurso, não de arena. Por isso existe o `lendas_respawn_vivo`: em mapa
 * onde renascer atrapalharia, é só desligar.
 *
 * E tem espera entre um e outro. Sem ela, segurar a tecla vira teleporte
 * infinito para o spawn, e alguns mapas têm mecanismo perto do nascimento que
 * não gosta disso.
 */
public Plugin myinfo =
{
    name = "[LENDAS] Renascer",
    author = "LENDAS / Codex",
    description = "Deixa qualquer jogador renascer com !r, sem depender do truque do espectador.",
    version = PLUGIN_VERSION,
    url = ""
};

ConVar g_CvarAtivo;
ConVar g_CvarEspera;
ConVar g_CvarVivo;
ConVar g_CvarAviso;

/** Quando cada jogador renasceu pela última vez. */
float g_fUltimo[MAXPLAYERS + 1];

public void OnPluginStart()
{
    CreateConVar("lendas_respawn_version", PLUGIN_VERSION,
        "Versão do [LENDAS] Renascer.", FCVAR_NOTIFY | FCVAR_DONTRECORD);

    g_CvarAtivo = CreateConVar("lendas_respawn_ativo", "1",
        "Liga o !r para todo mundo. 0 = só admin, pelo sm_respawn com alvo.",
        FCVAR_NONE, true, 0.0, true, 1.0);

    g_CvarEspera = CreateConVar("lendas_respawn_espera", "3.0",
        "Segundos entre um renascimento e o próximo, por jogador.",
        FCVAR_NONE, true, 0.0, true, 120.0);

    g_CvarVivo = CreateConVar("lendas_respawn_vivo", "1",
        "1 = pode renascer estando vivo, para recomeçar o percurso. 0 = só depois de morrer.",
        FCVAR_NONE, true, 0.0, true, 1.0);

    g_CvarAviso = CreateConVar("lendas_respawn_aviso", "1",
        "Avisa no chat de quem entra que o !r existe. 0 = calado.",
        FCVAR_NONE, true, 0.0, true, 1.0);

    AutoExecConfig(true, "lendas_respawn", "sourcemod");

    // Três nomes para a mesma coisa: quem vem de outro servidor já tem um
    // deles no dedo, e não custa nada aceitar os três.
    RegConsoleCmd("sm_r", Comando_Renascer, "Renasce no comeco do mapa.");
    RegConsoleCmd("sm_rs", Comando_Renascer, "Renasce no comeco do mapa.");
    RegConsoleCmd("sm_respawn", Comando_Renascer, "Renasce no comeco do mapa. Com um alvo, renasce outra pessoa (admin).");

    HookEvent("round_start", Evento_RoundStart, EventHookMode_PostNoCopy);
}

public void OnClientPutInServer(int client)
{
    g_fUltimo[client] = 0.0;

    if (!g_CvarAtivo.BoolValue || !g_CvarAviso.BoolValue || IsFakeClient(client))
    {
        return;
    }
    CreateTimer(20.0, Timer_Contar, GetClientUserId(client));
}

/**
 * O aviso chega vinte segundos depois de entrar.
 *
 * Na hora exata em que a pessoa entra, o chat está cheio das mensagens de
 * conexão e do mapa carregando, e mais uma linha ali passa batida. Vinte
 * segundos depois ela já está jogando e é quando a informação serve.
 */
public Action Timer_Contar(Handle timer, any userid)
{
    int client = GetClientOfUserId(userid);
    if (client > 0 && IsClientInGame(client))
    {
        PrintToChat(client, "\x04[LENDAS]\x01 Travou no percurso? Digite \x04!r\x01 para renascer no comeco.");
    }
    return Plugin_Stop;
}

public Action Comando_Renascer(int client, int args)
{
    // Com alvo: é comando de admin. Sem alvo: é o jogador em si.
    if (args >= 1)
    {
        return RenascerOutros(client);
    }

    if (client == 0)
    {
        ReplyToCommand(client, "[LENDAS] Do console, use sm_respawn <jogador>.");
        return Plugin_Handled;
    }

    if (!g_CvarAtivo.BoolValue)
    {
        PrintToChat(client, "\x04[LENDAS]\x01 O renascer esta desligado neste mapa.");
        return Plugin_Handled;
    }

    int time = GetClientTeam(client);
    if (time != CS_TEAM_T && time != CS_TEAM_CT)
    {
        PrintToChat(client, "\x04[LENDAS]\x01 Entre em um time antes de renascer.");
        return Plugin_Handled;
    }

    if (IsPlayerAlive(client) && !g_CvarVivo.BoolValue)
    {
        PrintToChat(client, "\x04[LENDAS]\x01 Aqui so da para renascer depois de morrer.");
        return Plugin_Handled;
    }

    float espera = g_CvarEspera.FloatValue;
    float desde = GetGameTime() - g_fUltimo[client];
    if (g_fUltimo[client] > 0.0 && desde < espera)
    {
        PrintToChat(client, "\x04[LENDAS]\x01 Espere \x04%.0f\x01 segundo(s) para renascer de novo.",
            espera - desde);
        return Plugin_Handled;
    }

    Renascer(client);
    return Plugin_Handled;
}

/**
 * Renascer estando vivo exige morrer antes.
 *
 * `CS_RespawnPlayer` num jogador vivo deixa o jogo em estado esquisito — dois
 * corpos, contagem de vivos errada. Matar primeiro é o que o próprio jogo faz
 * quando alguém troca de time no meio da rodada.
 *
 * A morte não conta como abate de ninguém: `ForcePlayerSuicide` credita ao
 * próprio jogador, e no placar de um mapa de percurso isso não incomoda —
 * mas é o motivo de o `lendas_respawn_vivo` existir para quem se incomodar.
 */
void Renascer(int client)
{
    if (IsPlayerAlive(client))
    {
        ForcePlayerSuicide(client);
    }
    CS_RespawnPlayer(client);
    g_fUltimo[client] = GetGameTime();
}

// Sem `args`: o alvo vem sempre do primeiro argumento, e quem chama ja
// conferiu que existe pelo menos um.
Action RenascerOutros(int client)
{
    if (!CheckCommandAccess(client, "lendas_respawn_outros", ADMFLAG_SLAY))
    {
        ReplyToCommand(client, "[LENDAS] Renascer outra pessoa e so para admin.");
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

    int n = 0;
    for (int i = 0; i < quantos; i++)
    {
        int time = GetClientTeam(alvos[i]);
        if (time == CS_TEAM_T || time == CS_TEAM_CT)
        {
            Renascer(alvos[i]);
            n++;
        }
    }

    ShowActivity2(client, "[LENDAS] ", "fez %s renascer.", nomeAlvo);
    LogAction(client, -1, "\"%L\" renasceu %s (%d)", client, nomeAlvo, n);
    return Plugin_Handled;
}

/**
 * Zera a espera de todo mundo quando o round vira.
 *
 * Sem isto, quem renasceu nos últimos segundos do round começaria o seguinte
 * ainda esperando — e a espera existe contra a repetição em sequência, não
 * para atrapalhar quem está começando de novo.
 */
public void Evento_RoundStart(Event evento, const char[] nome, bool naoTransmitir)
{
    for (int i = 1; i <= MaxClients; i++)
    {
        g_fUltimo[i] = 0.0;
    }
}

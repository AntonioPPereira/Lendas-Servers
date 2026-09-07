#pragma semicolon 1
#pragma newdecls required

#include <sourcemod>
#include <sdktools>

#define PLUGIN_VERSION "2.0.0"

#define PASTA "lendas_narrador"

/**
 * Narração da C4 — sem a música de entrada.
 *
 * POR QUE FOI REESCRITO
 *
 * A 1.x fazia duas coisas coladas: narrava a bomba E tocava uma música de
 * introdução quando o jogador entrava. O dono do servidor quis a música fora
 * e a narração dentro, e o plugin não tinha cvar nenhum — a música estava
 * cravada num `ClientCommand(client, "play ...")`. Sem fonte, a única saída
 * pelo servidor era desligar o plugin inteiro e perder a narração junto.
 *
 * Esta versão foi reconstruída lendo o binário antigo: os cinco momentos
 * narrados, os nomes dos arquivos de som e o texto de boas-vindas vieram de
 * lá. O que não veio foi a música.
 *
 * UM GANHO DE QUEBRA
 *
 * A 1.x registrava a música na tabela de downloads — 9,4 MB que todo jogador
 * novo baixava antes de entrar. Sem ela, sobra menos de 500 KB de narração.
 *
 * OS SONS TÊM VERSÕES
 *
 * A pasta tem `_v1` a `_v5` de cada frase, de vozes diferentes, que a 1.x não
 * usava. O cvar `lendas_narrador_voz` escolhe qual — e um arquivo que não
 * existir é anunciado no log em vez de virar silêncio inexplicado.
 */
public Plugin myinfo =
{
    name = "[LENDAS] Narrador da C4",
    author = "LENDAS / Codex",
    description = "Narra a bomba: plantada, contagem e defusa. Sem música de entrada.",
    version = PLUGIN_VERSION,
    url = ""
};

ConVar g_CvarAtivo;
ConVar g_CvarVoz;
ConVar g_CvarBoasVindas;
ConVar g_CvarC4Timer;

/** Os cinco momentos narrados, na ordem em que acontecem. */
enum Momento
{
    Som_Plantada = 0,
    Som_30s,
    Som_10s,
    Som_Explodindo,
    Som_Defusada,
    TOTAL_SONS
};

char g_sBase[TOTAL_SONS][] = {
    "a_c4_foi_plantada",
    "30_segundos_para_explodir",
    "10_segundos_para_explodir",
    "a_bomba_vai_explodir",
    "c4_defusada",
};

/** Caminho final de cada som, já com a voz e a extensão que existem. */
char g_sSom[TOTAL_SONS][PLATFORM_MAX_PATH];
bool g_bTemSom[TOTAL_SONS];

Handle g_hTimer30 = null;
Handle g_hTimer10 = null;
Handle g_hTimerExplodindo = null;

public void OnPluginStart()
{
    CreateConVar("lendas_narrador_version", PLUGIN_VERSION,
        "Versão do [LENDAS] Narrador da C4.", FCVAR_NOTIFY | FCVAR_DONTRECORD);

    g_CvarAtivo = CreateConVar("lendas_narrador_ativo", "1",
        "Liga a narração da bomba. 0 = calado.", FCVAR_NONE, true, 0.0, true, 1.0);

    g_CvarVoz = CreateConVar("lendas_narrador_voz", "",
        "Qual gravação usar: vazio para a original, ou _v1 a _v5 para as outras vozes.");

    g_CvarBoasVindas = CreateConVar("lendas_narrador_boasvindas", "1",
        "Manda a mensagem de boas-vindas no chat de quem entra. 0 = nada. (A música de entrada foi removida na 2.0.0 e não volta por cvar.)",
        FCVAR_NONE, true, 0.0, true, 1.0);

    AutoExecConfig(true, "lendas_narrador", "sourcemod");

    g_CvarC4Timer = FindConVar("mp_c4timer");

    HookEvent("bomb_planted", Evento_Plantada, EventHookMode_Post);
    HookEvent("bomb_defused", Evento_Defusada, EventHookMode_Post);
    HookEvent("bomb_exploded", Evento_Explodiu, EventHookMode_Post);
    HookEvent("round_start", Evento_RoundStart, EventHookMode_Post);
    HookEvent("round_end", Evento_RoundEnd, EventHookMode_Post);
}

/**
 * Monta o caminho de cada som e confere se ele existe.
 *
 * A extensão não é fixa: a gravação original é `.wav` e as versões de voz são
 * `.mp3`. Em vez de exigir uma convenção que a pasta não segue, o plugin
 * tenta as duas e usa a que estiver lá.
 */
public void OnMapStart()
{
    char voz[8];
    g_CvarVoz.GetString(voz, sizeof(voz));

    int achados = 0;
    for (int i = 0; i < view_as<int>(TOTAL_SONS); i++)
    {
        g_bTemSom[i] = false;
        g_sSom[i][0] = 0;

        // A ordem tenta o .mp3 primeiro: as vozes alternativas só existem
        // nesse formato, e a original existe nos dois.
        char tentativa[PLATFORM_MAX_PATH];
        for (int e = 0; e < 2; e++)
        {
            FormatEx(tentativa, sizeof(tentativa), "%s/%s%s.%s",
                PASTA, g_sBase[i], voz, (e == 0) ? "mp3" : "wav");

            char noDisco[PLATFORM_MAX_PATH];
            FormatEx(noDisco, sizeof(noDisco), "sound/%s", tentativa);

            if (FileExists(noDisco, true))
            {
                strcopy(g_sSom[i], sizeof(g_sSom[]), tentativa);
                g_bTemSom[i] = true;
                achados++;
                break;
            }
        }

        if (!g_bTemSom[i])
        {
            LogError("Som ausente: %s/%s%s (.mp3 e .wav). Esse aviso ficará mudo.",
                PASTA, g_sBase[i], voz);
            continue;
        }

        PrecacheSound(g_sSom[i], true);

        // O cliente precisa baixar cada som, senão ouve silêncio. A música de
        // entrada NÃO entra aqui — era ela que respondia por 9,4 MB.
        char paraBaixar[PLATFORM_MAX_PATH];
        FormatEx(paraBaixar, sizeof(paraBaixar), "sound/%s", g_sSom[i]);
        AddFileToDownloadsTable(paraBaixar);
    }

    LogMessage("narrador: %d de %d sons encontrados (voz '%s').",
        achados, view_as<int>(TOTAL_SONS), voz[0] == 0 ? "original" : voz);

    MatarTimers();
}

public void OnClientPostAdminCheck(int client)
{
    if (!g_CvarBoasVindas.BoolValue || IsFakeClient(client))
    {
        return;
    }
    // Só texto. A música que a 1.x tocava aqui saiu de vez.
    PrintToChat(client, "\x04[LENDAS]\x01 Bem-vindo ao servidor L.E.N.D.A.S! Digite \x04!vip\x01 para ver o seu painel.");
}

void Tocar(Momento qual)
{
    int i = view_as<int>(qual);
    if (!g_CvarAtivo.BoolValue || !g_bTemSom[i])
    {
        return;
    }
    EmitSoundToAll(g_sSom[i]);
}

void MatarTimers()
{
    // `delete` num Handle nulo é seguro no SourceMod moderno, e é o que evita
    // o par KillTimer/atribuir null espalhado por toda parte.
    delete g_hTimer30;
    delete g_hTimer10;
    delete g_hTimerExplodindo;
}

/**
 * Marca os avisos a partir do tempo que a bomba ainda tem.
 *
 * O `mp_c4timer` é lido na hora, e não guardado: ele muda entre configurações
 * (o mix usa 35, o padrão da casa é 45), e um valor lido no carregamento
 * daria avisos na hora errada depois de uma troca de modo.
 *
 * Cada aviso só é marcado se couber: com o timer em 25 segundos não existe
 * "faltam 30", e marcar um timer negativo faria o aviso disparar na hora.
 */
public void Evento_Plantada(Event evento, const char[] nome, bool naoTransmitir)
{
    MatarTimers();
    Tocar(Som_Plantada);

    float total = (g_CvarC4Timer != null) ? g_CvarC4Timer.FloatValue : 45.0;

    if (total > 31.0)
    {
        g_hTimer30 = CreateTimer(total - 30.0, Timer_Aviso30);
    }
    if (total > 11.0)
    {
        g_hTimer10 = CreateTimer(total - 10.0, Timer_Aviso10);
    }
    if (total > 4.0)
    {
        g_hTimerExplodindo = CreateTimer(total - 3.0, Timer_AvisoExplodindo);
    }
}

public Action Timer_Aviso30(Handle timer)
{
    g_hTimer30 = null;
    Tocar(Som_30s);
    return Plugin_Stop;
}

public Action Timer_Aviso10(Handle timer)
{
    g_hTimer10 = null;
    Tocar(Som_10s);
    return Plugin_Stop;
}

public Action Timer_AvisoExplodindo(Handle timer)
{
    g_hTimerExplodindo = null;
    Tocar(Som_Explodindo);
    return Plugin_Stop;
}

public void Evento_Defusada(Event evento, const char[] nome, bool naoTransmitir)
{
    // Primeiro cala a contagem: sem isto, o "10 segundos para explodir"
    // dispararia depois da bomba já estar defusada.
    MatarTimers();
    Tocar(Som_Defusada);
}

public void Evento_Explodiu(Event evento, const char[] nome, bool naoTransmitir)
{
    MatarTimers();
}

public void Evento_RoundStart(Event evento, const char[] nome, bool naoTransmitir)
{
    MatarTimers();
}

public void Evento_RoundEnd(Event evento, const char[] nome, bool naoTransmitir)
{
    MatarTimers();
}

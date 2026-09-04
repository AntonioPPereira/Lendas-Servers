#pragma semicolon 1
#pragma newdecls required

#include <sourcemod>
#include <sdktools>

#define PLUGIN_VERSION "2.0.0"

/**
 * Fecha os atalhos de "sair e voltar limpo".
 *
 * Existem DUAS rotas para o mesmo truque, e a 1.x só fechava uma:
 *
 * 1. ESPECTADOR. Trocar de time limpa as relações de `m_bPlayerDominated` e
 *    reentrar num time paga `mp_startmoney`;
 * 2. DESCONEXÃO. Sair do servidor e voltar zera tudo, inclusive o placar.
 *
 * A 1.x guardava o estado por SLOT e apagava tudo no disconnect, justamente
 * para não punir quem caiu. O efeito foi o contrário do pretendido: deixou a
 * rota da desconexão escancarada, que é a mais fácil das duas.
 *
 * Agora o estado é guardado por STEAMID e sobrevive à desconexão. E isso
 * resolve o dilema de "e quem caiu de verdade?" sem precisar adivinhar
 * intenção: **devolver o estado não pune ninguém**. Quem caiu volta com o que
 * tinha, que é o que ele quer; quem saiu de propósito volta com o que tinha,
 * que é o que ele NÃO quer. A mesma regra serve aos dois.
 *
 * A dominância também é guardada por par de SteamID, não por slot — no
 * reconectar o jogador pode receber outro slot, e um índice velho apontaria
 * para a pessoa errada.
 *
 * ZOAÇÃO E MULTA SÓ NA ROTA DO ESPECTADOR. Ir pro espectador é ato
 * deliberado e observável; cair não é. Punir desconexão puniria quem teve
 * queda de energia, e não existe jeito de distinguir isso de dentro do jogo.
 */

public Plugin myinfo =
{
    name = "[LENDAS] Anti-abuso do Spec",
    author = "LENDAS Network",
    description = "Impede resetar dinheiro, frags e dominância pelo espectador ou pela desconexão.",
    version = PLUGIN_VERSION,
    url = "https://www.lendascss.com.br"
};

#define TIME_NENHUM     0
#define TIME_ESPECTADOR 1
#define TIME_TR         2
#define TIME_CT         3

/** Quantos jogadores cabem na memória. Servidor de 14 slots com folga. */
#define MAX_GUARDADOS 64

/** Quantas relações de dominância cabem. 14 jogadores dão no máximo 182 pares. */
#define MAX_PARES 256

ConVar g_CvarDinheiro;
ConVar g_CvarPlacar;
ConVar g_CvarDominancia;
ConVar g_CvarMemoria;
ConVar g_CvarDebug;
ConVar g_CvarZoar;
ConVar g_CvarSom;
ConVar g_CvarMulta;
ConVar g_CvarTolerancia;
ConVar g_CvarJanela;

// ---- memória por SteamID, sobrevive à desconexão -------------------------
char  g_sDono[MAX_GUARDADOS][32];
int   g_iDinheiro[MAX_GUARDADOS];
int   g_iFrags[MAX_GUARDADOS];
int   g_iMortes[MAX_GUARDADOS];
float g_fQuando[MAX_GUARDADOS];
bool  g_bViaSpec[MAX_GUARDADOS];   // saiu pelo menu de times, não por queda
int   g_iTentativas[MAX_GUARDADOS];

// ---- dominância por PAR de SteamID: A domina B ---------------------------
char g_sDomina[MAX_PARES][32];
char g_sDominado[MAX_PARES][32];
int  g_iPares;

/** -1 = não olhamos ainda; 0 = netprops não existem; 1 = existem. */
int g_iTemDominancia = -1;
int g_iTemPlacar = -1;

public void OnPluginStart()
{
    CreateConVar("lendas_spec_version", PLUGIN_VERSION, "Versão do [LENDAS] Anti-abuso do Spec.",
        FCVAR_NOTIFY | FCVAR_DONTRECORD);

    g_CvarDinheiro = CreateConVar("lendas_spec_dinheiro", "1",
        "Devolve o dinheiro ao voltar do espectador ou de uma desconexão.", _, true, 0.0, true, 1.0);
    g_CvarPlacar = CreateConVar("lendas_spec_placar", "1",
        "Devolve frags e mortes ao voltar.", _, true, 0.0, true, 1.0);
    g_CvarDominancia = CreateConVar("lendas_spec_dominancia", "1",
        "Devolve as relações de dominância ao voltar.", _, true, 0.0, true, 1.0);
    g_CvarMemoria = CreateConVar("lendas_spec_memoria", "900",
        "Por quantos segundos o estado de quem saiu continua guardado. Depois disso ele volta zerado, como qualquer um que chega.",
        _, true, 30.0, true, 7200.0);
    g_CvarDebug = CreateConVar("lendas_spec_debug", "0",
        "Registra no log cada foto e cada devolução.", _, true, 0.0, true, 1.0);
    g_CvarZoar = CreateConVar("lendas_spec_zoar", "1",
        "Anuncia no chat quem foi pro espectador fugir da dominância.", _, true, 0.0, true, 1.0);
    g_CvarSom = CreateConVar("lendas_spec_som", "quake/standard/humiliation.mp3",
        "Som tocado na zoação. Vazio = sem som.");
    g_CvarMulta = CreateConVar("lendas_spec_multa", "1500",
        "Multa em dólares. Só na rota do espectador, nunca na desconexão.", _, true, 0.0, true, 16000.0);
    g_CvarTolerancia = CreateConVar("lendas_spec_tolerancia", "0",
        "Quantas idas ao espectador são perdoadas antes de multar. 0 = pega já na primeira.",
        _, true, 0.0, true, 10.0);
    g_CvarJanela = CreateConVar("lendas_spec_janela", "180",
        "Segundos no espectador para ainda contar como fuga. Quem fica mais que isso não é cobrado.",
        _, true, 5.0, true, 3600.0);

    AddCommandListener(Lendas_AntesDeTrocar, "jointeam");
    AddCommandListener(Lendas_AntesDeTrocar, "spectate");

    HookEvent("player_team", Evento_TrocaDeTime, EventHookMode_Post);

    AutoExecConfig(true, "lendas_spec");
}

public void OnMapStart()
{
    char som[PLATFORM_MAX_PATH];
    g_CvarSom.GetString(som, sizeof(som));
    if (som[0] != EOS)
    {
        char caminho[PLATFORM_MAX_PATH];
        Format(caminho, sizeof(caminho), "sound/%s", som);
        if (FileExists(caminho, true))
        {
            PrecacheSound(som, true);
            AddFileToDownloadsTable(caminho);
        }
        else
        {
            LogError("Som da zoação não existe: %s. A zoação sai sem som.", caminho);
        }
    }

    // Mapa novo, partida nova: nada sobrevive. Devolver placar de um mapa
    // anterior seria inventar história.
    for (int i = 0; i < MAX_GUARDADOS; i++)
    {
        g_sDono[i][0] = EOS;
    }
    g_iPares = 0;
}

// ==========================================================================
//  Memória por SteamID
// ==========================================================================

/** Índice do registro deste SteamID, ou -1. */
int Lendas_Achar(const char[] steam)
{
    for (int i = 0; i < MAX_GUARDADOS; i++)
    {
        if (g_sDono[i][0] != EOS && StrEqual(g_sDono[i], steam))
        {
            return i;
        }
    }
    return -1;
}

/**
 * Índice para gravar: o do próprio jogador, ou um vago, ou o mais velho.
 *
 * Reaproveitar o mais velho quando lota é melhor que recusar a gravação — o
 * registro antigo já passou da validade de qualquer forma.
 */
int Lendas_Vaga(const char[] steam)
{
    int existente = Lendas_Achar(steam);
    if (existente != -1)
    {
        return existente;
    }

    int maisVelho = 0;
    for (int i = 0; i < MAX_GUARDADOS; i++)
    {
        if (g_sDono[i][0] == EOS)
        {
            return i;
        }
        if (g_fQuando[i] < g_fQuando[maisVelho])
        {
            maisVelho = i;
        }
    }
    return maisVelho;
}

bool Lendas_SteamDe(int client, char[] saida, int tamanho)
{
    if (!IsClientInGame(client) || IsFakeClient(client))
    {
        return false;
    }
    return GetClientAuthId(client, AuthId_Steam2, saida, tamanho);
}

// ==========================================================================
//  Detecção de netprops — perguntar antes de ler
// ==========================================================================

void Lendas_Detectar(int client)
{
    if (g_iTemDominancia == -1)
    {
        bool tem = HasEntProp(client, Prop_Send, "m_bPlayerDominated")
                && HasEntProp(client, Prop_Send, "m_bPlayerDominatingMe");
        g_iTemDominancia = tem ? 1 : 0;
        if (tem)
        {
            LogMessage("Dominância disponível. Proteção ligada.");
        }
        else
        {
            LogError("Netprops de dominância não existem neste jogo — essa parte fica desligada.");
        }
    }

    if (g_iTemPlacar == -1)
    {
        bool tem = HasEntProp(client, Prop_Send, "m_iFrags")
                && HasEntProp(client, Prop_Send, "m_iDeaths");
        g_iTemPlacar = tem ? 1 : 0;
        if (tem)
        {
            LogMessage("Placar disponível (m_iFrags + m_iDeaths). Proteção ligada.");
        }
        else
        {
            LogError("Netprops de placar não existem neste jogo — frags não serão devolvidos.");
        }
    }
}

// ==========================================================================
//  Fotografar
// ==========================================================================

/**
 * Guarda tudo o que o jogador tem agora.
 *
 * `viaSpec` separa as duas rotas: só a do menu de times pode gerar cobrança.
 * Desconexão é indistinguível de queda de energia vista de dentro do jogo.
 */
void Lendas_Fotografar(int client, bool viaSpec)
{
    char steam[32];
    if (!Lendas_SteamDe(client, steam, sizeof(steam)))
    {
        return;
    }

    int time = GetClientTeam(client);
    if (time != TIME_TR && time != TIME_CT)
    {
        return;
    }

    Lendas_Detectar(client);

    int i = Lendas_Vaga(steam);
    int tentativasAntes = StrEqual(g_sDono[i], steam) ? g_iTentativas[i] : 0;

    strcopy(g_sDono[i], sizeof(g_sDono[]), steam);
    g_iDinheiro[i] = GetEntProp(client, Prop_Send, "m_iAccount");
    g_iFrags[i] = (g_iTemPlacar == 1) ? GetEntProp(client, Prop_Send, "m_iFrags") : -1;
    g_iMortes[i] = (g_iTemPlacar == 1) ? GetEntProp(client, Prop_Send, "m_iDeaths") : -1;
    g_fQuando[i] = GetGameTime();
    g_bViaSpec[i] = viaSpec;
    g_iTentativas[i] = tentativasAntes;

    if (g_iTemDominancia == 1)
    {
        Lendas_GuardarDominancia(client, steam);
    }

    if (g_CvarDebug.BoolValue)
    {
        LogMessage("foto de %N (%s): $%d, %d frags, via %s",
            client, steam, g_iDinheiro[i], g_iFrags[i], viaSpec ? "spec" : "desconexao");
    }
}

/** Regrava os pares de dominância deste jogador, nos dois sentidos. */
void Lendas_GuardarDominancia(int client, const char[] steam)
{
    // Fora os pares antigos deste jogador — serão reescritos com o estado
    // de agora, e manter os dois faria a dominância ressuscitar.
    for (int p = g_iPares - 1; p >= 0; p--)
    {
        if (StrEqual(g_sDomina[p], steam) || StrEqual(g_sDominado[p], steam))
        {
            g_iPares--;
            strcopy(g_sDomina[p], 32, g_sDomina[g_iPares]);
            strcopy(g_sDominado[p], 32, g_sDominado[g_iPares]);
        }
    }

    for (int outro = 1; outro <= MaxClients; outro++)
    {
        char steamOutro[32];
        if (outro == client || !Lendas_SteamDe(outro, steamOutro, sizeof(steamOutro)))
        {
            continue;
        }

        if (GetEntProp(client, Prop_Send, "m_bPlayerDominated", 1, outro) != 0)
        {
            Lendas_AddPar(steam, steamOutro);
        }
        if (GetEntProp(client, Prop_Send, "m_bPlayerDominatingMe", 1, outro) != 0)
        {
            Lendas_AddPar(steamOutro, steam);
        }
    }
}

void Lendas_AddPar(const char[] domina, const char[] dominado)
{
    for (int p = 0; p < g_iPares; p++)
    {
        if (StrEqual(g_sDomina[p], domina) && StrEqual(g_sDominado[p], dominado))
        {
            return;
        }
    }
    if (g_iPares >= MAX_PARES)
    {
        return;
    }
    strcopy(g_sDomina[g_iPares], 32, domina);
    strcopy(g_sDominado[g_iPares], 32, dominado);
    g_iPares++;
}

// ==========================================================================
//  Gatilhos
// ==========================================================================

/** Antes da troca de time — única janela em que o estado ainda é o real. */
public Action Lendas_AntesDeTrocar(int client, const char[] comando, int args)
{
    if (client > 0 && IsClientInGame(client))
    {
        Lendas_Fotografar(client, true);
    }
    return Plugin_Continue;
}

/**
 * Desconexão. A 1.x APAGAVA o estado aqui; agora ele é gravado.
 *
 * É a correção central desta versão: sair do servidor era a rota mais fácil
 * de resetar tudo, justamente porque o plugin cooperava.
 */
public void OnClientDisconnect(int client)
{
    Lendas_Fotografar(client, false);
}

public void Evento_TrocaDeTime(Event event, const char[] name, bool dontBroadcast)
{
    int client = GetClientOfUserId(event.GetInt("userid"));
    if (client <= 0 || !IsClientInGame(client) || event.GetBool("disconnect"))
    {
        return;
    }

    int novo = event.GetInt("team");
    int velho = event.GetInt("oldteam");

    // Entrar num time jogável, vindo do espectador OU de recém-chegado
    // (reconexão cai aqui, com oldteam "sem time").
    if (novo != TIME_TR && novo != TIME_CT)
    {
        return;
    }
    if (velho != TIME_ESPECTADOR && velho != TIME_NENHUM)
    {
        return;
    }

    // O jogo ainda mexe no jogador depois deste evento; devolver agora seria
    // sobrescrito no mesmo quadro.
    RequestFrame(Lendas_DevolverNoFrame, GetClientUserId(client));
}

public void Lendas_DevolverNoFrame(any userid)
{
    int client = GetClientOfUserId(userid);
    char steam[32];
    if (client <= 0 || !Lendas_SteamDe(client, steam, sizeof(steam)))
    {
        return;
    }

    int i = Lendas_Achar(steam);
    if (i == -1)
    {
        return;
    }

    // Passou da memória: volta zerado, como qualquer um que chega agora.
    if (GetGameTime() - g_fQuando[i] > g_CvarMemoria.FloatValue)
    {
        g_sDono[i][0] = EOS;
        return;
    }

    Lendas_Detectar(client);

    if (g_CvarDinheiro.BoolValue && g_iDinheiro[i] >= 0)
    {
        SetEntProp(client, Prop_Send, "m_iAccount", g_iDinheiro[i]);
    }

    if (g_CvarPlacar.BoolValue && g_iTemPlacar == 1 && g_iFrags[i] >= 0)
    {
        SetEntProp(client, Prop_Send, "m_iFrags", g_iFrags[i]);
        SetEntProp(client, Prop_Send, "m_iDeaths", g_iMortes[i]);
    }

    if (g_CvarDominancia.BoolValue && g_iTemDominancia == 1)
    {
        Lendas_DevolverDominancia(client, steam);
    }

    bool viaSpec = g_bViaSpec[i];
    float fora = GetGameTime() - g_fQuando[i];

    if (g_CvarDebug.BoolValue)
    {
        LogMessage("devolvido a %N: $%d, %d frags, %.0fs fora, via %s",
            client, g_iDinheiro[i], g_iFrags[i], fora, viaSpec ? "spec" : "desconexao");
    }

    // A foto se gasta ao ser usada, mas o contador de tentativas fica: é ele
    // que sabe que o jogador é reincidente NESTE mapa.
    g_sDono[i][0] = EOS;

    if (viaSpec)
    {
        Lendas_Zoar(client, steam, fora);
    }
}

/** Repõe a dominância nos dois lados, resolvendo SteamID para o slot atual. */
void Lendas_DevolverDominancia(int client, const char[] steam)
{
    for (int outro = 1; outro <= MaxClients; outro++)
    {
        char steamOutro[32];
        if (outro == client || !Lendas_SteamDe(outro, steamOutro, sizeof(steamOutro)))
        {
            continue;
        }

        bool euDomino = Lendas_TemPar(steam, steamOutro);
        bool eleMeDomina = Lendas_TemPar(steamOutro, steam);

        SetEntProp(client, Prop_Send, "m_bPlayerDominated", euDomino ? 1 : 0, 1, outro);
        SetEntProp(client, Prop_Send, "m_bPlayerDominatingMe", eleMeDomina ? 1 : 0, 1, outro);

        // O espelho no outro jogador também foi limpo pelo jogo. Sem isto um
        // lado veria a relação e o outro não.
        SetEntProp(outro, Prop_Send, "m_bPlayerDominatingMe", euDomino ? 1 : 0, 1, client);
        SetEntProp(outro, Prop_Send, "m_bPlayerDominated", eleMeDomina ? 1 : 0, 1, client);
    }
}

bool Lendas_TemPar(const char[] domina, const char[] dominado)
{
    for (int p = 0; p < g_iPares; p++)
    {
        if (StrEqual(g_sDomina[p], domina) && StrEqual(g_sDominado[p], dominado))
        {
            return true;
        }
    }
    return false;
}

// ==========================================================================
//  Humilhação pública — só na rota do espectador
// ==========================================================================

void Lendas_Zoar(int client, const char[] steam, float fora)
{
    if (!g_CvarZoar.BoolValue || g_iTemDominancia != 1)
    {
        return;
    }

    // Só quem ESTAVA sendo dominado tentou fugir de alguma coisa. Quem foi
    // pro espectador por outro motivo não passa vergonha à toa.
    int dominadores = 0;
    int primeiro = -1;
    for (int outro = 1; outro <= MaxClients; outro++)
    {
        char steamOutro[32];
        if (outro == client || !Lendas_SteamDe(outro, steamOutro, sizeof(steamOutro)))
        {
            continue;
        }
        if (Lendas_TemPar(steamOutro, steam))
        {
            dominadores++;
            if (primeiro == -1)
            {
                primeiro = outro;
            }
        }
    }

    if (dominadores == 0 || fora > g_CvarJanela.FloatValue)
    {
        return;
    }

    int i = Lendas_Vaga(steam);
    strcopy(g_sDono[i], sizeof(g_sDono[]), steam);
    g_fQuando[i] = GetGameTime();
    g_iDinheiro[i] = -1;
    g_iFrags[i] = -1;
    g_iTentativas[i]++;
    int vezes = g_iTentativas[i];

    if (vezes <= g_CvarTolerancia.IntValue)
    {
        PrintToChat(client, "\x04[LENDAS]\x01 Você voltou como saiu: nada foi resetado. Se repetir, tem multa.");
        return;
    }

    char extra[64];
    if (vezes > 1)
    {
        Format(extra, sizeof(extra), " Já é a \x04%dª vez\x01.", vezes);
    }

    if (dominadores == 1)
    {
        PrintToChatAll("\x04[LENDAS]\x01 \x03%N\x01 correu pro espectador pra fugir da dominância de \x03%N\x01. Voltou do mesmo jeito.%s",
            client, primeiro, extra);
    }
    else
    {
        PrintToChatAll("\x04[LENDAS]\x01 \x03%N\x01 correu pro espectador pra fugir de \x03%d\x01 dominâncias. Voltou com todas.%s",
            client, dominadores, extra);
    }

    for (int outro = 1; outro <= MaxClients; outro++)
    {
        char steamOutro[32];
        if (outro == client || !Lendas_SteamDe(outro, steamOutro, sizeof(steamOutro)))
        {
            continue;
        }
        if (Lendas_TemPar(steamOutro, steam))
        {
            PrintToChat(outro, "\x04[LENDAS]\x01 \x03%N\x01 tentou fugir da SUA dominância. Continua sendo seu.", client);
        }
    }

    PrintCenterText(client, "Não colou.");

    char som[PLATFORM_MAX_PATH];
    g_CvarSom.GetString(som, sizeof(som));
    if (som[0] != EOS)
    {
        EmitSoundToAll(som);
    }

    int multa = g_CvarMulta.IntValue;
    if (multa > 0)
    {
        int agora = GetEntProp(client, Prop_Send, "m_iAccount");
        int novo = agora - multa;
        SetEntProp(client, Prop_Send, "m_iAccount", novo < 0 ? 0 : novo);
        PrintToChat(client, "\x04[LENDAS]\x01 Multa de \x03$%d\x01 pela tentativa.", multa);
    }
}

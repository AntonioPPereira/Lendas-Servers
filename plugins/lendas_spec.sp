#pragma semicolon 1
#pragma newdecls required

#include <sourcemod>
#include <sdktools>

#define PLUGIN_VERSION "2.1.0"

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
 * QUEM CAIU NÃO É PUNIDO. O evento `player_disconnect` traz o MOTIVO da
 * saída, e é ele que separa quem clicou em desconectar de quem perdeu a
 * conexão. A regra é deliberadamente torta a favor do inocente: só pune
 * quando o motivo bate na lista de saída voluntária E não bate na lista de
 * problema de rede. Motivo desconhecido não pune. Ver `Lendas_SaidaFoiEscolha`.
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
ConVar g_CvarPunirSaida;
ConVar g_CvarMotivoVoluntario;
ConVar g_CvarMotivoInocente;

/** Motivo da desconexão, capturado antes do jogador sumir. */
char g_sMotivo[MAXPLAYERS + 1][96];

// ---- memória por SteamID, sobrevive à desconexão -------------------------
char  g_sDono[MAX_GUARDADOS][32];
int   g_iDinheiro[MAX_GUARDADOS];
int   g_iFrags[MAX_GUARDADOS];
int   g_iMortes[MAX_GUARDADOS];
float g_fQuando[MAX_GUARDADOS];
bool  g_bViaSpec[MAX_GUARDADOS];   // saiu pelo menu de times
bool  g_bSaidaEscolhida[MAX_GUARDADOS];  // desconectou por vontade, não por queda
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
        "Anuncia no chat quem tentou resetar pelo espectador ou pela desconexão.", _, true, 0.0, true, 1.0);
    g_CvarSom = CreateConVar("lendas_spec_som", "quake/standard/humiliation.mp3",
        "Som tocado na zoação. Vazio = sem som.");
    g_CvarMulta = CreateConVar("lendas_spec_multa", "1500",
        "Multa em dólares, nas duas rotas. Quem CAI nunca paga.", _, true, 0.0, true, 16000.0);
    g_CvarTolerancia = CreateConVar("lendas_spec_tolerancia", "0",
        "Quantas idas ao espectador são perdoadas antes de multar. 0 = pega já na primeira.",
        _, true, 0.0, true, 10.0);
    g_CvarJanela = CreateConVar("lendas_spec_janela", "180",
        "Segundos fora para ainda contar como fuga. Quem fica mais que isso não é cobrado.",
        _, true, 5.0, true, 3600.0);
    g_CvarPunirSaida = CreateConVar("lendas_spec_punir_saida", "1",
        "Pune também quem desconecta e volta correndo. Quem CAI nunca é punido — ver as duas cvars abaixo.",
        _, true, 0.0, true, 1.0);
    g_CvarMotivoVoluntario = CreateConVar("lendas_spec_saida_voluntaria", "by user,quit,left the game",
        "Trechos do motivo de desconexão que contam como saída por vontade própria. Separados por vírgula.");
    g_CvarMotivoInocente = CreateConVar("lendas_spec_saida_inocente", "timed out,timeout,overflow,connection,loss,steam,shutdown",
        "Trechos que SEMPRE inocentam, mesmo se casarem com a lista de cima. Queda de conexão vive aqui.");

    AddCommandListener(Lendas_AntesDeTrocar, "jointeam");
    AddCommandListener(Lendas_AntesDeTrocar, "spectate");

    HookEvent("player_team", Evento_TrocaDeTime, EventHookMode_Post);

    // Pre: o motivo precisa estar em mãos antes do jogador sumir de vez.
    HookEvent("player_disconnect", Evento_Desconectou, EventHookMode_Pre);

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
    g_bSaidaEscolhida[i] = viaSpec ? false : Lendas_SaidaFoiEscolha(client);
    g_iTentativas[i] = tentativasAntes;

    if (g_iTemDominancia == 1)
    {
        Lendas_GuardarDominancia(client, steam);
    }

    if (g_CvarDebug.BoolValue)
    {
        LogMessage("foto de %N (%s): $%d, %d frags, via %s%s",
            client, steam, g_iDinheiro[i], g_iFrags[i], viaSpec ? "spec" : "desconexao",
            viaSpec ? "" : (g_bSaidaEscolhida[i] ? " ESCOLHIDA" : " (caiu — nao pune)"));
        if (!viaSpec)
        {
            LogMessage("   motivo cru: \"%s\"", g_sMotivo[client]);
        }
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

/** O motivo chega neste evento e some junto com o jogador. Guarda antes. */
public Action Evento_Desconectou(Event event, const char[] name, bool dontBroadcast)
{
    int client = GetClientOfUserId(event.GetInt("userid"));
    if (client > 0 && client <= MaxClients)
    {
        event.GetString("reason", g_sMotivo[client], sizeof(g_sMotivo[]));
    }
    return Plugin_Continue;
}

/**
 * A saída foi escolha do jogador, ou o link caiu?
 *
 * Torta a favor do inocente, de propósito: para punir, o motivo precisa bater
 * na lista de saída voluntária E não bater na de problema de rede. Motivo
 * desconhecido, vazio ou irreconhecível **não pune**.
 *
 * A lista de inocentes vence a de voluntários. É o que garante o pedido de
 * "não aplique em quem tomou timeout" mesmo que um dia a Valve mude a string
 * e ela passe a conter, digamos, a palavra "quit".
 */
bool Lendas_SaidaFoiEscolha(int client)
{
    if (g_sMotivo[client][0] == EOS)
    {
        return false;
    }

    char motivo[96];
    strcopy(motivo, sizeof(motivo), g_sMotivo[client]);
    String_ToLower(motivo, motivo, sizeof(motivo));

    char lista[256];

    // Inocentes primeiro: quem cai nunca é cobrado, custe o que custar.
    g_CvarMotivoInocente.GetString(lista, sizeof(lista));
    if (Lendas_MotivoBate(motivo, lista))
    {
        return false;
    }

    g_CvarMotivoVoluntario.GetString(lista, sizeof(lista));
    return Lendas_MotivoBate(motivo, lista);
}

/** Algum trecho da lista separada por vírgula aparece no motivo? */
bool Lendas_MotivoBate(const char[] motivo, const char[] lista)
{
    char pedacos[16][40];
    int n = ExplodeString(lista, ",", pedacos, sizeof(pedacos), sizeof(pedacos[]));
    for (int i = 0; i < n; i++)
    {
        TrimString(pedacos[i]);
        String_ToLower(pedacos[i], pedacos[i], sizeof(pedacos[]));
        if (pedacos[i][0] != EOS && StrContains(motivo, pedacos[i]) != -1)
        {
            return true;
        }
    }
    return false;
}

void String_ToLower(const char[] entrada, char[] saida, int tamanho)
{
    int i = 0;
    for (; entrada[i] != EOS && i < tamanho - 1; i++)
    {
        saida[i] = CharToLower(entrada[i]);
    }
    saida[i] = EOS;
}

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
public void OnClientPutInServer(int client)
{
    // Slot reaproveitado não pode herdar o motivo de quem saiu antes.
    g_sMotivo[client][0] = EOS;
}

public void OnClientDisconnect(int client)
{
    Lendas_Fotografar(client, false);
    g_sMotivo[client][0] = EOS;
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
    bool saidaEscolhida = g_bSaidaEscolhida[i];
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
    else if (saidaEscolhida && g_CvarPunirSaida.BoolValue)
    {
        Lendas_ZoarSaida(client, steam, fora);
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
//  Humilhação pública
// ==========================================================================
/**
 * Punição da rota da DESCONEXÃO.
 *
 * Aqui não se exige que ele estivesse sendo dominado: o que ele foi buscar é
 * o reset do dinheiro e dos frags, e isso vale para qualquer um. O que se
 * exige é que a saída tenha sido escolha dele (já julgado pelo motivo) e que
 * a volta tenha sido rápida — quem sai e volta horas depois não estava
 * farmando nada.
 */
void Lendas_ZoarSaida(int client, const char[] steam, float fora)
{
    if (!g_CvarZoar.BoolValue || fora > g_CvarJanela.FloatValue)
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
        PrintToChat(client, "\x04[LENDAS]\x01 Você voltou como saiu: dinheiro e frags intactos. Se repetir, tem multa.");
        return;
    }

    char extra[64];
    if (vezes > 1)
    {
        Format(extra, sizeof(extra), " Já é a \x04%dª vez\x01.", vezes);
    }

    PrintToChatAll("\x04[LENDAS]\x01 \x03%N\x01 desconectou e voltou correndo pra resetar dinheiro e frags. Voltou com tudo igual.%s",
        client, extra);

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
        int resto = agora - multa;
        SetEntProp(client, Prop_Send, "m_iAccount", resto < 0 ? 0 : resto);
        PrintToChat(client, "\x04[LENDAS]\x01 Multa de \x03$%d\x01 pela tentativa.", multa);
    }
}


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

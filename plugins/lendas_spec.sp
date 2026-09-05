#pragma semicolon 1
#pragma newdecls required

#include <sourcemod>
#include <sdktools>

#define PLUGIN_VERSION "2.8.0"

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
ConVar g_CvarPerdeFrags;
ConVar g_CvarCongelar;
ConVar g_CvarSlay;
ConVar g_CvarRodadas;

/** Quantos spawns ainda carregam castigo. Zera sozinho. */
int g_iCastigo[MAXPLAYERS + 1];

/**
 * Quando o jogador mandou `jointeam`/`spectate` pela última vez.
 *
 * Serve só para separar quem ESCOLHEU ir do que foi movido por plugin ou
 * admin. Sem esse cuidado, um `sm_allspec` puniria o servidor inteiro na
 * volta.
 */
float g_fComandoEm[MAXPLAYERS + 1];

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

/** -1 = não olhamos ainda; 0 = não existe; 1 = existe. */
int g_iTemDominancia = -1;

/**
 * Onde mora o placar: 0 = em lugar nenhum, 1 = Prop_Send, 2 = Prop_Data.
 *
 * No CS:S `m_iFrags` NÃO é propriedade de rede — vive no datamap, e o
 * scoreboard é alimentado pela entidade de recursos do jogo, não pelo
 * jogador. Procurar só em `Prop_Send` fazia o plugin concluir que o placar
 * não existia e desligar essa metade em silêncio.
 */
int g_iOndePlacar = -1;

/**
 * Escreve dinheiro respeitando o teto do servidor.
 *
 * `SetEntProp` em `m_iAccount` fura o `mp_maxmoney` — o jogo só aplica esse
 * limite nos caminhos dele. Um valor guardado errado, vindo de onde for,
 * viraria dinheiro que nem existe nas regras da partida.
 *
 * A trava é a última linha de defesa, não a correção da causa: se ela
 * precisar agir, tem coisa errada antes, e o log registra isso alto.
 */
void Lendas_EscreverDinheiro(int client, int valor, const char[] origem)
{
    int teto = 16000;
    ConVar cv = FindConVar("mp_maxmoney");
    if (cv != null && cv.IntValue > 0)
    {
        teto = cv.IntValue;
    }

    int antes = GetEntProp(client, Prop_Send, "m_iAccount");
    int final = valor < 0 ? 0 : valor;

    if (final > teto)
    {
        LogError("[%s] tentou escrever $%d em %N, acima do mp_maxmoney (%d). Travado no teto — investigar a origem.",
            origem, valor, client, teto);
        final = teto;
    }

    SetEntProp(client, Prop_Send, "m_iAccount", final);

    if (g_CvarDebug.BoolValue)
    {
        LogMessage("[%s] dinheiro de %N: %d -> %d (teto %d)", origem, client, antes, final, teto);
    }
}

public void OnPluginStart()
{
    CreateConVar("lendas_spec_version", PLUGIN_VERSION, "Versão do [LENDAS] Anti-abuso do Spec.",
        FCVAR_NOTIFY | FCVAR_DONTRECORD);

    g_CvarDinheiro = CreateConVar("lendas_spec_dinheiro", "2",
        "0 = não mexe. 1 = devolve exatamente o que tinha. 2 = devolve o MENOR entre o que tinha e o que tem agora, de modo que a ida e volta nunca renda lucro.",
        _, true, 0.0, true, 2.0);
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
        "Anuncia no chat quem foi e voltou correndo, pelas duas rotas.", _, true, 0.0, true, 1.0);
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
    g_CvarMotivoVoluntario = CreateConVar("lendas_spec_saida_voluntaria", "client disconnect,by user,quit,left the game",
        "Trechos do motivo que contam como saída por vontade própria. MEDIDO neste servidor: o CS:S usa \"Client Disconnect\".");
    g_CvarMotivoInocente = CreateConVar("lendas_spec_saida_inocente", "timed out,timeout,overflow,connection lost,loss,steam,shutdown,kick,ban,map change,changelevel",
        "Trechos que SEMPRE inocentam, mesmo casando com a lista de cima. Queda, kick e troca de mapa vivem aqui.");
    g_CvarPerdeFrags = CreateConVar("lendas_spec_perde_frags", "3",
        "Frags descontados do placar. É o castigo que dói e NÃO penaliza o time junto.",
        _, true, 0.0, true, 100.0);
    g_CvarCongelar = CreateConVar("lendas_spec_congelar", "6.0",
        "Segundos preso no lugar ao nascer. 0 = desliga.", _, true, 0.0, true, 30.0);
    g_CvarSlay = CreateConVar("lendas_spec_slay", "0",
        "Mata ao nascer, pelas rodadas de castigo. Deixa o time com um a menos — ligue sabendo disso.",
        _, true, 0.0, true, 1.0);
    g_CvarRodadas = CreateConVar("lendas_spec_rodadas", "1",
        "Por quantos nascimentos o congelar/slay valem.", _, true, 1.0, true, 10.0);

    AddCommandListener(Lendas_AntesDeTrocar, "jointeam");
    AddCommandListener(Lendas_AntesDeTrocar, "spectate");

    HookEvent("player_team", Evento_TrocaDeTime, EventHookMode_Post);
    HookEvent("player_spawn", Evento_Nasceu, EventHookMode_Post);

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

    if (g_iOndePlacar == -1)
    {
        if (HasEntProp(client, Prop_Send, "m_iFrags") && HasEntProp(client, Prop_Send, "m_iDeaths"))
        {
            g_iOndePlacar = 1;
            LogMessage("Placar em Prop_Send. Proteção ligada.");
        }
        else if (HasEntProp(client, Prop_Data, "m_iFrags") && HasEntProp(client, Prop_Data, "m_iDeaths"))
        {
            g_iOndePlacar = 2;
            LogMessage("Placar em Prop_Data (o normal no CS:S). Proteção ligada.");
        }
        else
        {
            g_iOndePlacar = 0;
            LogError("Não achei m_iFrags nem em Prop_Send nem em Prop_Data — frags ficam de fora.");
        }
    }
}

// ==========================================================================
//  Fotografar
// ==========================================================================

int Lendas_LerPlacar(int client, const char[] campo)
{
    if (g_iOndePlacar == 1) return GetEntProp(client, Prop_Send, campo);
    if (g_iOndePlacar == 2) return GetEntProp(client, Prop_Data, campo);
    return -1;
}

void Lendas_EscreverPlacar(int client, const char[] campo, int valor)
{
    if (g_iOndePlacar == 1) SetEntProp(client, Prop_Send, campo, valor);
    else if (g_iOndePlacar == 2) SetEntProp(client, Prop_Data, campo, valor);
}

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
    g_iFrags[i] = Lendas_LerPlacar(client, "m_iFrags");
    g_iMortes[i] = Lendas_LerPlacar(client, "m_iDeaths");
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
        LogMessage("FOTO de %N (%s): $%d, %d frags, via %s%s",
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
        g_fComandoEm[client] = GetGameTime();
        if (g_CvarDebug.BoolValue)
        {
            LogMessage("comando '%s' de %N (time atual %d)", comando, client, GetClientTeam(client));
        }
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
    // Slot reaproveitado não pode herdar nada de quem saiu antes.
    g_sMotivo[client][0] = EOS;
    g_iCastigo[client] = 0;
    g_fComandoEm[client] = 0.0;
}

/**
 * O castigo físico só pode ser aplicado ao NASCER.
 *
 * Quem volta do espectador no meio da rodada entra morto e só nasce na
 * seguinte — congelar ou matar na hora da volta não faria absolutamente
 * nada, porque não existe corpo em jogo para congelar.
 */
public void Evento_Nasceu(Event event, const char[] name, bool dontBroadcast)
{
    int client = GetClientOfUserId(event.GetInt("userid"));
    if (client <= 0 || !IsClientInGame(client) || g_iCastigo[client] <= 0)
    {
        return;
    }

    g_iCastigo[client]--;

    if (g_CvarSlay.BoolValue)
    {
        ForcePlayerSuicide(client);
        PrintCenterText(client, "Castigo: você morre esta rodada.");
        return;
    }

    float segundos = g_CvarCongelar.FloatValue;
    if (segundos > 0.0)
    {
        SetEntityMoveType(client, MOVETYPE_NONE);
        CreateTimer(segundos, Timer_Descongelar, GetClientUserId(client), TIMER_FLAG_NO_MAPCHANGE);
        PrintCenterText(client, "Preso por %.0fs. Não colou.", segundos);
    }
}

public Action Timer_Descongelar(Handle timer, any userid)
{
    int client = GetClientOfUserId(userid);
    if (client > 0 && IsClientInGame(client) && IsPlayerAlive(client))
    {
        SetEntityMoveType(client, MOVETYPE_WALK);
    }
    return Plugin_Stop;
}

/**
 * O castigo em si, igual nas duas rotas.
 *
 * Os frags vêm primeiro de propósito: é o único que atinge SÓ o infrator.
 * Congelar e matar tiram um jogador do time por uma rodada, então quem paga
 * parte da conta são os companheiros — por isso o slay sai de fábrica
 * desligado e o congelamento é curto.
 */
void Lendas_AplicarCastigo(int client)
{
    int perde = g_CvarPerdeFrags.IntValue;
    if (perde > 0 && g_iOndePlacar > 0)
    {
        int agora = Lendas_LerPlacar(client, "m_iFrags");
        int resto = agora - perde;
        Lendas_EscreverPlacar(client, "m_iFrags", resto < 0 ? 0 : resto);
        PrintToChat(client, "\x04[LENDAS]\x01 Menos \x03%d frags\x01 pela tentativa.", perde);
    }

    int multa = g_CvarMulta.IntValue;
    if (multa > 0)
    {
        int agora = GetEntProp(client, Prop_Send, "m_iAccount");
        Lendas_EscreverDinheiro(client, agora - multa, "multa");
        PrintToChat(client, "\x04[LENDAS]\x01 Multa de \x03$%d\x01.", multa);
    }

    if (g_CvarSlay.BoolValue || g_CvarCongelar.FloatValue > 0.0)
    {
        g_iCastigo[client] = g_CvarRodadas.IntValue;
    }
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

    /**
     * SAINDO de um time jogável para o espectador.
     *
     * O ouvinte de `jointeam` nem sempre vê essa troca — medido no servidor:
     * o log do jogo registrou idas ao espectador sem nenhum comando chegar
     * aqui. Sem foto não há devolução nem punição, e a rota inteira fica
     * muda.
     *
     * Fotografar aqui é seguro para o dinheiro: o jogo paga `mp_startmoney`
     * ao ENTRAR num time, não ao sair dele.
     *
     * `viaSpec` — que autoriza a punição — só vale se o jogador tiver mandado
     * o comando há menos de um segundo. Movido por plugin ou admin, o estado
     * é preservado mas ninguém é cobrado.
     */
    if (novo == TIME_ESPECTADOR && (velho == TIME_TR || velho == TIME_CT))
    {
        char steam[32];
        if (Lendas_SteamDe(client, steam, sizeof(steam)) && Lendas_Achar(steam) == -1)
        {
            bool escolheu = (GetGameTime() - g_fComandoEm[client]) < 1.0;
            if (g_CvarDebug.BoolValue)
            {
                LogMessage("foto de reserva no player_team para %N (escolheu=%d)", client, escolheu);
            }
            Lendas_Fotografar(client, escolheu);
        }
        return;
    }

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

    int modo = g_CvarDinheiro.IntValue;
    if (modo > 0 && g_iDinheiro[i] >= 0)
    {
        /**
         * Modo 2: o MENOR entre o guardado e o atual.
         *
         * Devolver o valor exato fecha o ganho de quem estava quebrado, mas
         * PREMIA quem estava rico: sem o plugin ele voltaria com o dinheiro
         * inicial, e com ele mantém a bolada. O menor dos dois fecha os dois
         * lados — a ida e volta nunca rende, e para quem tinha muito ela
         * custa, que é o desestímulo que faltava.
         */
        int agora = GetEntProp(client, Prop_Send, "m_iAccount");
        int alvo = (modo == 2 && agora < g_iDinheiro[i]) ? agora : g_iDinheiro[i];
        Lendas_EscreverDinheiro(client, alvo, modo == 2 ? "devolucao-menor" : "devolucao");
    }

    if (g_CvarPlacar.BoolValue && g_iOndePlacar > 0 && g_iFrags[i] >= 0)
    {
        Lendas_EscreverPlacar(client, "m_iFrags", g_iFrags[i]);
        Lendas_EscreverPlacar(client, "m_iDeaths", g_iMortes[i]);
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
        PrintToChat(client, "\x04[LENDAS]\x01 Nada foi resetado. Se repetir, tem multa.");
        return;
    }

    char extra[64];
    if (vezes > 1)
    {
        Format(extra, sizeof(extra), " Já é a \x04%dª vez\x01.", vezes);
    }

    PrintToChatAll("\x04[LENDAS]\x01 \x03%N\x01 deu retry pra resetar. Nao colou.%s",
        client, extra);

    if (g_CvarDebug.BoolValue)
    {
        LogMessage("anuncio publico emitido para %N", client);
    }

    PrintCenterText(client, "Nao colou.");

    char som[PLATFORM_MAX_PATH];
    g_CvarSom.GetString(som, sizeof(som));
    if (som[0] != EOS)
    {
        EmitSoundToAll(som);
    }

    Lendas_AplicarCastigo(client);
}


/**
 * Punição da rota do ESPECTADOR.
 *
 * O portão é a VOLTA RÁPIDA, não a dominância. Quem sai e volta correndo foi
 * buscar o reset de dinheiro e frags, tenha ou não alguém dominando ele —
 * exigir dominância deixava passar a maioria dos casos reais.
 *
 * A dominância só decide o TEXTO: quando existe, o anúncio nomeia de quem ele
 * tentou fugir, e cada dominador recebe o recado no privado. Sem ela, o
 * anúncio é o genérico de reset.
 */
void Lendas_Zoar(int client, const char[] steam, float fora)
{
    if (!g_CvarZoar.BoolValue || fora > g_CvarJanela.FloatValue)
    {
        return;
    }

    // Quem o dominava, se é que a informação existe neste jogo.
    int dominadores = 0;
    int primeiro = -1;
    if (g_iTemDominancia == 1)
    {
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
        PrintToChat(client, "\x04[LENDAS]\x01 Nada foi resetado. Se repetir, tem multa.");
        return;
    }

    char extra[64];
    if (vezes > 1)
    {
        Format(extra, sizeof(extra), " Já é a \x04%dª vez\x01.", vezes);
    }

    if (dominadores == 1)
    {
        PrintToChatAll("\x04[LENDAS]\x01 \x03%N\x01 fugiu da dominancia de \x03%N\x01. Nao colou.%s",
            client, primeiro, extra);
    }
    else if (dominadores > 1)
    {
        PrintToChatAll("\x04[LENDAS]\x01 \x03%N\x01 fugiu de \x03%d\x01 dominancias. Nao colou.%s",
            client, dominadores, extra);
    }
    else
    {
        PrintToChatAll("\x04[LENDAS]\x01 \x03%N\x01 foi pro spec pra resetar. Nao colou.%s",
            client, extra);
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
            PrintToChat(outro, "\x04[LENDAS]\x01 \x03%N\x01 tentou fugir da SUA dominancia.", client);
        }
    }

    if (g_CvarDebug.BoolValue)
    {
        LogMessage("anuncio publico emitido para %N", client);
    }

    PrintCenterText(client, "Nao colou.");

    char som[PLATFORM_MAX_PATH];
    g_CvarSom.GetString(som, sizeof(som));
    if (som[0] != EOS)
    {
        EmitSoundToAll(som);
    }

    Lendas_AplicarCastigo(client);
}

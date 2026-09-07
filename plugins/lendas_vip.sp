#pragma semicolon 1
#pragma newdecls required

#include <sourcemod>
#include <sdktools>
#include <clientprefs>

#define PLUGIN_VERSION "2.0.0"

#define ARQUIVO_SKINS "configs/lendas_vip_skins.cfg"
#define MAX_SKINS 32
#define SEM_SKIN 0

/**
 * Painel VIP: skins e rastro de tiro, com espaço para o que vier depois.
 *
 * REESCRITA DO ZERO (2.0.0)
 *
 * A 1.x existia só como `.smx`, sem fonte — a mesma situação que fez o
 * gravador de demos ser perdido para sempre em 29/08. Esta versão foi
 * reconstruída lendo o binário antigo: comandos, cvars, textos e a lista de
 * skins vieram de lá, para ninguém sentir a troca.
 *
 * DOIS DEFEITOS DA 1.x QUE ESTA VERSÃO NÃO TEM
 *
 * 1. Ela registrava para download a pasta de materiais INTEIRA de uma das
 *    skins: 73 arquivos, 257 MB. Quem entrava tinha de baixar isso antes de
 *    ver qualquer coisa, e quem desistia no meio entrava sem os arquivos e
 *    via o boneco de ERROR. Aqui este plugin não registra download nenhum —
 *    esse assunto é do `lendas_downloads`, que trabalha com uma lista mínima
 *    montada a partir do que cada modelo realmente usa.
 *
 * 2. O caminho de material do Batman aparecia cortado no primeiro espaço
 *    (`.../batmanlaugh/the`), porque a lista era quebrada por espaço e a
 *    pasta se chama "the batman who laughs". Aqui não existe essa lista, e o
 *    problema deixa de existir junto.
 *
 * COMO CRESCER SEM MEXER NO CÓDIGO
 *
 * As skins vêm de `configs/lendas_vip_skins.cfg` e o menu é montado a partir
 * do arquivo. Skin nova é um bloco lá, mais os arquivos dela na lista do
 * `lendas_downloads`. Benefício de outro tipo entra como um item novo no
 * menu principal: a estrutura já separa "quem é VIP" de "o que o VIP ganha".
 */
public Plugin myinfo =
{
    name = "[LENDAS] VIP",
    author = "LENDAS / Codex",
    description = "Painel VIP: skins por time e rastro de tiro, com preferências salvas por jogador.",
    version = PLUGIN_VERSION,
    url = ""
};

/* ------------------------------------------------------------------ cvars */

ConVar g_CvarAtivo;
ConVar g_CvarFlag;
ConVar g_CvarTracerVida;
ConVar g_CvarTracerLargura;
ConVar g_CvarSkinPadraoTR;
ConVar g_CvarSkinPadraoCT;

/* ------------------------------------------------------------- preferência */

Cookie g_ckSkinTR;
Cookie g_ckSkinCT;
Cookie g_ckTracer;

/** Escolha atual de cada jogador. 0 = modelo padrão do jogo. */
int g_iSkinTR[MAXPLAYERS + 1];
int g_iSkinCT[MAXPLAYERS + 1];
int g_iTracer[MAXPLAYERS + 1];

/* ------------------------------------------------------------------ skins */

enum struct Skin
{
    int id;
    char nome[64];
    char modelo[PLATFORM_MAX_PATH];
    bool valeTR;
    bool valeCT;
    bool carregou;   // o .mdl existe e foi pré-carregado?
}

Skin g_Skins[MAX_SKINS];
int g_nSkins;

/* ---------------------------------------------------------------- tracers */

enum struct Cor
{
    char nome[32];
    int r;
    int g;
    int b;
}

// As cores da 1.x, na mesma ordem — quem já tinha escolhido não vê mudar.
Cor g_Cores[] = {
    { "Verde Neon",     0, 255,  64 },
    { "Azul Ciano",     0, 200, 255 },
    { "Vermelho Fogo",255,  40,  20 },
    { "Amarelo Ouro", 255, 210,   0 },
    { "Roxo Violeta", 170,  60, 255 },
    { "Branco",       255, 255, 255 },
};

int g_iModeloFeixe = -1;

/* =================================================================== ciclo */

public void OnPluginStart()
{
    CreateConVar("lendas_vip_version", PLUGIN_VERSION, "Versão do [LENDAS] VIP.",
        FCVAR_NOTIFY | FCVAR_DONTRECORD);

    g_CvarAtivo = CreateConVar("lendas_vip_enabled", "1",
        "Liga o painel VIP. 0 = desligado, e ninguém recebe benefício.",
        FCVAR_NONE, true, 0.0, true, 1.0);
    // "a" e nao "b": e o valor com que a 1.x rodava neste servidor, e VIP
    // costuma ser exatamente a flag de reserva de slot. Trocar isso por um
    // padrao "mais certo" tiraria o VIP de quem so tem "a".
    g_CvarFlag = CreateConVar("lendas_vip_flag", "a",
        "Flag de admin que dá acesso ao VIP (a, b, ... z). Vazio = todo mundo é VIP.");
    g_CvarTracerVida = CreateConVar("lendas_vip_tracer_life", "0.4",
        "Quanto tempo o rastro de tiro fica na tela, em segundos.",
        FCVAR_NONE, true, 0.1, true, 5.0);
    g_CvarTracerLargura = CreateConVar("lendas_vip_tracer_width", "1.8",
        "Espessura do rastro de tiro.", FCVAR_NONE, true, 0.1, true, 20.0);
    g_CvarSkinPadraoTR = CreateConVar("lendas_vip_skintr", "0",
        "Skin de TR para quem nunca escolheu. 0 = modelo padrão do jogo.",
        FCVAR_NONE, true, 0.0);
    g_CvarSkinPadraoCT = CreateConVar("lendas_vip_skinct", "0",
        "Skin de CT para quem nunca escolheu. 0 = modelo padrão do jogo.",
        FCVAR_NONE, true, 0.0);

    AutoExecConfig(true, "lendas_vip", "sourcemod");

    // Os três nomes da 1.x continuam valendo: quem digita !vip não pode
    // descobrir que mudou de plugin.
    RegConsoleCmd("sm_vip", Comando_Menu, "Abre o painel VIP.");
    RegConsoleCmd("sm_menuvip", Comando_Menu, "Abre o painel VIP.");
    RegConsoleCmd("sm_vips", Comando_Vips, "Lista os VIPs online.");

    g_ckSkinTR = new Cookie("lendas_vip_skin_tr", "Skin VIP do time TR", CookieAccess_Protected);
    g_ckSkinCT = new Cookie("lendas_vip_skin_ct", "Skin VIP do time CT", CookieAccess_Protected);
    g_ckTracer = new Cookie("lendas_vip_tracer", "Cor do rastro de tiro VIP", CookieAccess_Protected);

    HookEvent("player_spawn", Evento_Nasceu, EventHookMode_Post);
    HookEvent("bullet_impact", Evento_Tiro, EventHookMode_Post);

    for (int i = 1; i <= MaxClients; i++)
    {
        if (AreClientCookiesCached(i))
        {
            OnClientCookiesCached(i);
        }
    }
}

/**
 * Recarrega as skins e pré-carrega os modelos.
 *
 * O pré-carregamento tem de acontecer a cada mapa, e ANTES de alguém nascer:
 * `SetEntityModel` com um modelo não pré-carregado é justamente uma das
 * formas de o jogador virar ERROR.
 */
public void OnMapStart()
{
    CarregarSkins();

    g_iModeloFeixe = PrecacheModel("materials/sprites/laserbeam.vmt", true);
}

public void OnClientCookiesCached(int client)
{
    g_iSkinTR[client] = LerCookie(client, g_ckSkinTR, g_CvarSkinPadraoTR.IntValue);
    g_iSkinCT[client] = LerCookie(client, g_ckSkinCT, g_CvarSkinPadraoCT.IntValue);
    g_iTracer[client] = LerCookie(client, g_ckTracer, 0);
}

public void OnClientDisconnect(int client)
{
    g_iSkinTR[client] = 0;
    g_iSkinCT[client] = 0;
    g_iTracer[client] = 0;
}

int LerCookie(int client, Cookie ck, int padrao)
{
    char valor[8];
    ck.Get(client, valor, sizeof(valor));
    return valor[0] == 0 ? padrao : StringToInt(valor);
}

void GravarCookie(int client, Cookie ck, int valor)
{
    char texto[8];
    IntToString(valor, texto, sizeof(texto));
    ck.Set(client, texto);
}

/* ============================================================ leitura das skins */

/**
 * Lê as skins do arquivo e pré-carrega o que existir.
 *
 * Uma skin cujo `.mdl` não está no servidor é marcada como não carregada e
 * **some do menu**, em vez de aparecer e entregar um ERROR a quem escolher.
 * Falhar visivelmente aqui, no log, é melhor que falhar na cara do jogador.
 */
void CarregarSkins()
{
    g_nSkins = 0;

    char caminho[PLATFORM_MAX_PATH];
    BuildPath(Path_SM, caminho, sizeof(caminho), ARQUIVO_SKINS);

    KeyValues kv = new KeyValues("Skins");
    if (!kv.ImportFromFile(caminho))
    {
        delete kv;
        LogError("Não consegui ler %s — o menu fica só com os tracers.", caminho);
        return;
    }

    if (!kv.GotoFirstSubKey())
    {
        delete kv;
        LogError("%s não tem nenhuma skin dentro.", caminho);
        return;
    }

    int semArquivo = 0;
    do
    {
        if (g_nSkins >= MAX_SKINS)
        {
            LogError("Mais de %d skins no arquivo; o resto foi ignorado.", MAX_SKINS);
            break;
        }

        char chave[16];
        kv.GetSectionName(chave, sizeof(chave));

        Skin s;
        s.id = StringToInt(chave);
        kv.GetString("nome", s.nome, sizeof(s.nome), "sem nome");
        kv.GetString("modelo", s.modelo, sizeof(s.modelo), "");

        char times[16];
        kv.GetString("times", times, sizeof(times), "ambos");
        s.valeTR = StrEqual(times, "ambos", false) || StrEqual(times, "tr", false);
        s.valeCT = StrEqual(times, "ambos", false) || StrEqual(times, "ct", false);

        if (s.id <= 0 || s.modelo[0] == 0)
        {
            LogError("Skin '%s' ignorada: precisa de um número maior que zero e de um modelo.", chave);
            continue;
        }

        if (FileExists(s.modelo, true))
        {
            PrecacheModel(s.modelo, true);
            s.carregou = true;
        }
        else
        {
            s.carregou = false;
            semArquivo++;
            LogError("Skin %d (%s): o modelo %s não está no servidor. Ela não vai aparecer no menu.",
                s.id, s.nome, s.modelo);
        }

        g_Skins[g_nSkins] = s;
        g_nSkins++;
    }
    while (kv.GotoNextKey());

    delete kv;
    LogMessage("%d skin(s) lidas, %d sem o modelo no servidor.", g_nSkins, semArquivo);
}

int AcharSkin(int id)
{
    for (int i = 0; i < g_nSkins; i++)
    {
        if (g_Skins[i].id == id)
        {
            return i;
        }
    }
    return -1;
}

void NomeDaSkin(int id, char[] destino, int tamanho)
{
    int i = AcharSkin(id);
    strcopy(destino, tamanho, (i == -1) ? "Padrao" : g_Skins[i].nome);
}

/* ================================================================ benefícios */

bool EhVip(int client)
{
    if (!g_CvarAtivo.BoolValue || client <= 0 || !IsClientInGame(client))
    {
        return false;
    }

    char sFlag[8];
    g_CvarFlag.GetString(sFlag, sizeof(sFlag));
    if (sFlag[0] == 0)
    {
        return true;   // sem flag configurada, o VIP é de todos
    }

    AdminFlag flag;
    if (!FindFlagByChar(sFlag[0], flag))
    {
        return false;
    }
    return (GetUserFlagBits(client) & (FlagToBit(flag) | ADMFLAG_ROOT)) != 0;
}

public void Evento_Nasceu(Event evento, const char[] nome, bool naoTransmitir)
{
    int client = GetClientOfUserId(evento.GetInt("userid"));
    if (client <= 0 || !IsClientInGame(client) || IsFakeClient(client))
    {
        return;
    }

    // Um quadro de atraso: no instante do spawn o time e o modelo do jogador
    // ainda estão sendo definidos pelo jogo, e escrever antes disso é escrever
    // por cima do que o jogo vai escrever depois.
    CreateTimer(0.1, Timer_VestirSkin, GetClientUserId(client));
}

public Action Timer_VestirSkin(Handle timer, any userid)
{
    int client = GetClientOfUserId(userid);
    if (client <= 0 || !IsClientInGame(client) || !IsPlayerAlive(client) || !EhVip(client))
    {
        return Plugin_Stop;
    }

    int time = GetClientTeam(client);
    int escolha = (time == 2) ? g_iSkinTR[client] : (time == 3) ? g_iSkinCT[client] : SEM_SKIN;
    if (escolha == SEM_SKIN)
    {
        return Plugin_Stop;
    }

    int i = AcharSkin(escolha);
    if (i == -1 || !g_Skins[i].carregou)
    {
        return Plugin_Stop;
    }
    if ((time == 2 && !g_Skins[i].valeTR) || (time == 3 && !g_Skins[i].valeCT))
    {
        return Plugin_Stop;
    }

    SetEntityModel(client, g_Skins[i].modelo);
    return Plugin_Stop;
}

public void Evento_Tiro(Event evento, const char[] nome, bool naoTransmitir)
{
    int client = GetClientOfUserId(evento.GetInt("userid"));
    if (client <= 0 || !IsClientInGame(client) || !IsPlayerAlive(client))
    {
        return;
    }

    int cor = g_iTracer[client];
    if (cor <= 0 || cor > sizeof(g_Cores) || !EhVip(client) || g_iModeloFeixe <= 0)
    {
        return;
    }

    float origem[3], destino[3];
    GetClientEyePosition(client, origem);
    destino[0] = evento.GetFloat("x");
    destino[1] = evento.GetFloat("y");
    destino[2] = evento.GetFloat("z");

    int rgba[4];
    rgba[0] = g_Cores[cor - 1].r;
    rgba[1] = g_Cores[cor - 1].g;
    rgba[2] = g_Cores[cor - 1].b;
    rgba[3] = 255;

    float largura = g_CvarTracerLargura.FloatValue;
    TE_SetupBeamPoints(origem, destino, g_iModeloFeixe, 0, 0, 0,
        g_CvarTracerVida.FloatValue, largura, largura, 0, 0.0, rgba, 0);
    TE_SendToAll();
}

/* ===================================================================== menu */

public Action Comando_Menu(int client, int args)
{
    if (client == 0)
    {
        ReplyToCommand(client, "[LENDAS VIP] Este comando e para usar dentro do jogo.");
        return Plugin_Handled;
    }

    if (!g_CvarAtivo.BoolValue)
    {
        PrintToChat(client, "\x04[LENDAS VIP]\x01 O painel VIP esta desligado no momento.");
        return Plugin_Handled;
    }

    if (!EhVip(client))
    {
        // Mensagem curta de propósito: o chat do CS:S descarta o que passa de
        // ~127 bytes, e uma propaganda que ninguém lê não vende nada.
        PrintToChat(client, "\x04[LENDAS VIP]\x01 Exclusivo para VIP: skins e rastro de tiro colorido.");
        PrintToChat(client, "\x04[LENDAS VIP]\x01 Fale com um admin para adquirir o seu.");
        return Plugin_Handled;
    }

    MenuPrincipal(client);
    return Plugin_Handled;
}

public Action Comando_Vips(int client, int args)
{
    char lista[512];
    int n = 0;

    for (int i = 1; i <= MaxClients; i++)
    {
        if (IsClientInGame(i) && !IsFakeClient(i) && EhVip(i))
        {
            if (n > 0)
            {
                StrCat(lista, sizeof(lista), ", ");
            }
            char nome[MAX_NAME_LENGTH];
            GetClientName(i, nome, sizeof(nome));
            StrCat(lista, sizeof(lista), nome);
            n++;
        }
    }

    if (n == 0)
    {
        ReplyToCommand(client, "[LENDAS VIP] Nenhum VIP online agora.");
        return Plugin_Handled;
    }

    // O chat corta mensagem longa; com muita gente, o console dá conta.
    ReplyToCommand(client, "[LENDAS VIP] %d VIP(s) online.", n);
    PrintToConsole(client, "[LENDAS VIP] Online: %s", lista);
    return Plugin_Handled;
}

void MenuPrincipal(int client)
{
    char skinTR[64], skinCT[64], tracer[32];
    NomeDaSkin(g_iSkinTR[client], skinTR, sizeof(skinTR));
    NomeDaSkin(g_iSkinCT[client], skinCT, sizeof(skinCT));
    NomeDoTracer(g_iTracer[client], tracer, sizeof(tracer));

    Menu menu = new Menu(Escolha_Principal);
    menu.SetTitle("PAINEL VIP - LENDAS\n ");

    char linha[128];
    Format(linha, sizeof(linha), "Skins    TR [%s] | CT [%s]", skinTR, skinCT);
    menu.AddItem("skins", linha);

    Format(linha, sizeof(linha), "Rastro de tiro    [%s]", tracer);
    menu.AddItem("tracer", linha);

    menu.AddItem("info", "O que o VIP da");
    menu.ExitButton = true;
    menu.Display(client, MENU_TIME_FOREVER);
}

public int Escolha_Principal(Menu menu, MenuAction acao, int client, int item)
{
    if (acao == MenuAction_End)
    {
        delete menu;
        return 0;
    }
    if (acao != MenuAction_Select)
    {
        return 0;
    }

    char chave[16];
    menu.GetItem(item, chave, sizeof(chave));

    if (StrEqual(chave, "skins"))
    {
        MenuEscolherTime(client);
    }
    else if (StrEqual(chave, "tracer"))
    {
        MenuTracers(client);
    }
    else
    {
        MenuInfo(client);
    }
    return 0;
}

void MenuEscolherTime(int client)
{
    Menu menu = new Menu(Escolha_Time);
    menu.SetTitle("SKINS VIP - para qual time?\n ");
    menu.AddItem("tr", "Terrorista (TR)");
    menu.AddItem("ct", "Contra-Terrorista (CT)");
    menu.AddItem("ambos", "Os dois times de uma vez");
    menu.AddItem("nenhuma", "Desligar as skins (modelo padrao)");
    menu.ExitBackButton = true;
    menu.Display(client, MENU_TIME_FOREVER);
}

public int Escolha_Time(Menu menu, MenuAction acao, int client, int item)
{
    if (acao == MenuAction_End)
    {
        delete menu;
        return 0;
    }
    if (acao == MenuAction_Cancel && item == MenuCancel_ExitBack)
    {
        MenuPrincipal(client);
        return 0;
    }
    if (acao != MenuAction_Select)
    {
        return 0;
    }

    char chave[16];
    menu.GetItem(item, chave, sizeof(chave));

    if (StrEqual(chave, "nenhuma"))
    {
        g_iSkinTR[client] = SEM_SKIN;
        g_iSkinCT[client] = SEM_SKIN;
        GravarCookie(client, g_ckSkinTR, SEM_SKIN);
        GravarCookie(client, g_ckSkinCT, SEM_SKIN);
        PrintToChat(client, "\x04[LENDAS VIP]\x01 Skins desligadas. Valem no proximo nascimento.");
        MenuPrincipal(client);
        return 0;
    }

    MenuEscolherSkin(client, chave);
    return 0;
}

/** `alvo` é "tr", "ct" ou "ambos" e viaja no valor de cada item do menu. */
void MenuEscolherSkin(int client, const char[] alvo)
{
    Menu menu = new Menu(Escolha_Skin);

    char titulo[64];
    if (StrEqual(alvo, "tr")) strcopy(titulo, sizeof(titulo), "SKIN DO TERRORISTA\n ");
    else if (StrEqual(alvo, "ct")) strcopy(titulo, sizeof(titulo), "SKIN DO CONTRA-TERRORISTA\n ");
    else strcopy(titulo, sizeof(titulo), "SKIN DOS DOIS TIMES\n ");
    menu.SetTitle(titulo);

    char chave[32];
    for (int i = 0; i < g_nSkins; i++)
    {
        // Skin sem o modelo no servidor não entra: escolher e virar ERROR é
        // pior do que ela não estar lá.
        if (!g_Skins[i].carregou)
        {
            continue;
        }
        if (StrEqual(alvo, "tr") && !g_Skins[i].valeTR) continue;
        if (StrEqual(alvo, "ct") && !g_Skins[i].valeCT) continue;
        if (StrEqual(alvo, "ambos") && (!g_Skins[i].valeTR || !g_Skins[i].valeCT)) continue;

        Format(chave, sizeof(chave), "%s:%d", alvo, g_Skins[i].id);
        menu.AddItem(chave, g_Skins[i].nome);
    }

    Format(chave, sizeof(chave), "%s:0", alvo);
    menu.AddItem(chave, "Nenhuma (modelo padrao)");

    menu.ExitBackButton = true;
    menu.Display(client, MENU_TIME_FOREVER);
}

public int Escolha_Skin(Menu menu, MenuAction acao, int client, int item)
{
    if (acao == MenuAction_End)
    {
        delete menu;
        return 0;
    }
    if (acao == MenuAction_Cancel && item == MenuCancel_ExitBack)
    {
        MenuEscolherTime(client);
        return 0;
    }
    if (acao != MenuAction_Select)
    {
        return 0;
    }

    char chave[32];
    menu.GetItem(item, chave, sizeof(chave));

    char partes[2][16];
    ExplodeString(chave, ":", partes, sizeof(partes), sizeof(partes[]));
    int id = StringToInt(partes[1]);

    char nome[64];
    NomeDaSkin(id, nome, sizeof(nome));

    if (StrEqual(partes[0], "tr") || StrEqual(partes[0], "ambos"))
    {
        g_iSkinTR[client] = id;
        GravarCookie(client, g_ckSkinTR, id);
    }
    if (StrEqual(partes[0], "ct") || StrEqual(partes[0], "ambos"))
    {
        g_iSkinCT[client] = id;
        GravarCookie(client, g_ckSkinCT, id);
    }

    PrintToChat(client, "\x04[LENDAS VIP]\x01 Skin: \x04%s\x01. Vale no proximo nascimento.", nome);
    MenuPrincipal(client);
    return 0;
}

void NomeDoTracer(int cor, char[] destino, int tamanho)
{
    if (cor <= 0 || cor > sizeof(g_Cores))
    {
        strcopy(destino, tamanho, "Desligado");
        return;
    }
    strcopy(destino, tamanho, g_Cores[cor - 1].nome);
}

void MenuTracers(int client)
{
    Menu menu = new Menu(Escolha_Tracer);
    menu.SetTitle("RASTRO DE TIRO - escolha a cor\n ");

    char chave[8];
    for (int i = 0; i < sizeof(g_Cores); i++)
    {
        IntToString(i + 1, chave, sizeof(chave));
        menu.AddItem(chave, g_Cores[i].nome);
    }
    menu.AddItem("0", "Desligar o rastro");

    menu.ExitBackButton = true;
    menu.Display(client, MENU_TIME_FOREVER);
}

public int Escolha_Tracer(Menu menu, MenuAction acao, int client, int item)
{
    if (acao == MenuAction_End)
    {
        delete menu;
        return 0;
    }
    if (acao == MenuAction_Cancel && item == MenuCancel_ExitBack)
    {
        MenuPrincipal(client);
        return 0;
    }
    if (acao != MenuAction_Select)
    {
        return 0;
    }

    char chave[8];
    menu.GetItem(item, chave, sizeof(chave));
    int cor = StringToInt(chave);

    g_iTracer[client] = cor;
    GravarCookie(client, g_ckTracer, cor);

    char nome[32];
    NomeDoTracer(cor, nome, sizeof(nome));
    PrintToChat(client, "\x04[LENDAS VIP]\x01 Rastro de tiro: \x04%s\x01.", nome);

    MenuPrincipal(client);
    return 0;
}

void MenuInfo(int client)
{
    Menu menu = new Menu(Escolha_Info);
    menu.SetTitle("O QUE O VIP DA\n ");

    char linha[128];
    Format(linha, sizeof(linha), "%d skin(s) de jogador, por time", ContarSkinsUsaveis());
    menu.AddItem("", linha, ITEMDRAW_DISABLED);

    Format(linha, sizeof(linha), "%d cores de rastro de tiro", sizeof(g_Cores));
    menu.AddItem("", linha, ITEMDRAW_DISABLED);

    menu.AddItem("", "Sua escolha fica salva entre partidas", ITEMDRAW_DISABLED);
    menu.ExitBackButton = true;
    menu.Display(client, MENU_TIME_FOREVER);
}

public int Escolha_Info(Menu menu, MenuAction acao, int client, int item)
{
    if (acao == MenuAction_End)
    {
        delete menu;
    }
    else if (acao == MenuAction_Cancel && item == MenuCancel_ExitBack)
    {
        MenuPrincipal(client);
    }
    return 0;
}

int ContarSkinsUsaveis()
{
    int n = 0;
    for (int i = 0; i < g_nSkins; i++)
    {
        if (g_Skins[i].carregou)
        {
            n++;
        }
    }
    return n;
}

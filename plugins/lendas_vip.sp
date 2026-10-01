#pragma semicolon 1
#pragma newdecls required

#include <sourcemod>
#include <sdktools>
#include <clientprefs>

#define PLUGIN_VERSION "2.4.0"

#define ARQUIVO_SKINS "configs/lendas_vip_skins.cfg"
#define ARQUIVO_TRILHAS "configs/lendas_vip_trilhas.cfg"
#define MAX_TRILHAS 16
#define MAX_SKINS 32
#define SEM_SKIN 0

/**
 * Painel VIP: skins e rastro de tiro, com espaço para o que vier depois.
 *
 * REESCRITO DO ZERO (2.0.0), UMA SKIN SÓ (2.1.0)
 *
 * A 1.x existia só como `.smx`, sem fonte — a mesma situação que fez o
 * gravador de demos ser perdido para sempre em 29/08. Comandos, cvars,
 * textos e a lista de skins foram reconstruídos lendo o binário antigo.
 *
 * A 2.0.0 herdou dela a escolha de skin SEPARADA por time, TR e CT. Na
 * prática ninguém quer isso: quem escolhe um boneco quer aquele boneco, e a
 * separação só transformava uma decisão em três cliques. Na 2.1.0 a skin é
 * uma só e vale nos dois times. O campo `times` do arquivo de skins continua
 * existindo, mas agora serve para o caso raro de uma skin que só faz sentido
 * num lado — ela simplesmente não é vestida no outro.
 *
 * DOIS DEFEITOS DA 1.x QUE NÃO EXISTEM AQUI
 *
 * 1. Ela registrava para download a pasta de materiais INTEIRA de uma das
 *    skins: 73 arquivos, 257 MB por jogador. Quem desistia do download no
 *    meio entrava com arquivo pela metade e via o boneco de ERROR — e o CS:S
 *    nunca rebaixa o que já está em `cstrike/download/`, então isso não se
 *    curava sozinho. Aqui este plugin não registra download nenhum: esse
 *    assunto é do `lendas_downloads`, com lista mínima.
 * 2. O caminho de material do Batman saía cortado no primeiro espaço, porque
 *    a lista era quebrada por espaço e a pasta se chama "the batman who
 *    laughs". Sem a lista, o problema some junto.
 *
 * COMO CRESCER SEM MEXER NO CÓDIGO
 *
 * As skins vêm de `configs/lendas_vip_skins.cfg` e o menu é montado a partir
 * do arquivo. Skin nova é um bloco lá, mais os arquivos dela na lista do
 * `lendas_downloads`. Benefício de outro tipo entra como item novo no menu
 * principal: a estrutura separa "quem é VIP" de "o que o VIP ganha".
 */
public Plugin myinfo =
{
    name = "[LENDAS] VIP",
    author = "LENDAS / Codex",
    description = "Painel VIP: skin de jogador e rastro de tiro, com a escolha salva por jogador.",
    version = PLUGIN_VERSION,
    url = ""
};

/* ------------------------------------------------------------------ cvars */

ConVar g_CvarAtivo;
ConVar g_CvarFlag;
ConVar g_CvarTracerVida;
ConVar g_CvarTracerLargura;
ConVar g_CvarTrilhaAltura;
ConVar g_CvarSkinPadrao;

/* ------------------------------------------------------------- preferência */

Cookie g_ckSkin;
Cookie g_ckTracer;
Cookie g_ckTrilha;
Cookie g_ckTrilhaEstilo;

/** Escolha de cada jogador. 0 = modelo padrão do jogo. */
int g_iSkin[MAXPLAYERS + 1];

/**
 * Duas coisas parecidas que não são a mesma, e por isso têm nomes diferentes
 * no menu:
 *
 *   tracer  — o feixe do TIRO, do olho até onde a bala bateu. Aparece a cada
 *             disparo e some.
 *   trilha  — o rastro que segue o JOGADOR pelo mapa enquanto ele anda.
 *
 * Chamar as duas de "rastro" no menu faria o jogador ligar uma achando que
 * era a outra.
 */
int g_iTracer[MAXPLAYERS + 1];
int g_iTrilha[MAXPLAYERS + 1];
int g_iTrilhaEstilo[MAXPLAYERS + 1];

/**
 * A entidade de trilha viva de cada jogador, guardada como REFERENCIA.
 *
 * Indice de entidade e reaproveitado pelo jogo: guardar o numero cru faria o
 * plugin apagar, mais tarde, uma entidade completamente diferente que herdou
 * o mesmo indice. A referencia carrega um numero de serie junto e nao se
 * confunde.
 */
int g_iTrilhaEnt[MAXPLAYERS + 1];

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

/* --------------------------------------------------------------- trilhas */

/**
 * DOIS CAMINHOS PARA O MESMO ARQUIVO, E É DE PROPÓSITO
 *
 * O sprite precisa ser nomeado de dois jeitos diferentes, e trocar um pelo
 * outro faz a trilha simplesmente não aparecer — sem erro, sem aviso.
 *
 *   sprite  `materials/sprites/laserbeam.vmt`, o caminho de verdade no disco.
 *           É o que o `FileExists` entende.
 *
 *   modelo  `sprites/laserbeam.vmt`, sem o `materials/`. É o que vai para o
 *           `PrecacheModel` e para o `spritename` da entidade, porque o motor
 *           PREPENDE `materials/` sozinho ao carregar um sprite.
 *
 * Passar o caminho completo faz o motor procurar
 * `materials/materials/sprites/laserbeam.vmt`, não achar, e desistir calado.
 * Foi o que aconteceu aqui: os seis estilos existiam, o log dizia "6
 * utilizáveis", e nenhum desenhava.
 *
 * A prova não veio de adivinhar: das 1386 entidades de sprite nos mapas
 * instalados, 1384 escrevem o caminho SEM o prefixo.
 */
enum struct Trilha
{
    int id;
    char nome[64];
    char sprite[PLATFORM_MAX_PATH];   // com materials/, para o FileExists
    char modelo[PLATFORM_MAX_PATH];   // sem materials/, para o motor
    float largura;
    float fim;
    float duracao;
    int modo;
    bool existe;   // o sprite está nesta instalação do jogo?
}

Trilha g_Trilhas[MAX_TRILHAS];
int g_nTrilhas;

/* =================================================================== ciclo */

public void OnPluginStart()
{
    CreateConVar("lendas_vip_version", PLUGIN_VERSION, "Versão do [LENDAS] VIP.",
        FCVAR_NOTIFY | FCVAR_DONTRECORD);

    g_CvarAtivo = CreateConVar("lendas_vip_enabled", "1",
        "Liga o painel VIP. 0 = desligado, e ninguém recebe benefício.",
        FCVAR_NONE, true, 0.0, true, 1.0);

    // "a" e não "b": é o valor com que a 1.x rodava neste servidor, e VIP
    // costuma ser exatamente a flag de reserva de slot. Trocar isso por um
    // padrão "mais certo" tiraria o VIP de quem só tem "a".
    g_CvarFlag = CreateConVar("lendas_vip_flag", "a",
        "Flag de admin que dá acesso ao VIP (a, b, ... z). Vazio = todo mundo é VIP.");

    g_CvarTracerVida = CreateConVar("lendas_vip_tracer_life", "0.4",
        "Quanto tempo o rastro de tiro fica na tela, em segundos.",
        FCVAR_NONE, true, 0.1, true, 5.0);
    g_CvarTracerLargura = CreateConVar("lendas_vip_tracer_width", "1.8",
        "Espessura do rastro de tiro.", FCVAR_NONE, true, 0.1, true, 20.0);

    // A altura é medida a partir do CHÃO: a origem do jogador no Source fica
    // nos pés. 0 = colado no chão, 35 = cintura, 64 = cabeça — que era onde a
    // trilha ficava presa antes, e o motivo desta versão existir.
    g_CvarTrilhaAltura = CreateConVar("lendas_vip_trilha_altura", "8.0",
        "Altura da trilha a partir do chão, em unidades do jogo. 0 = no chão, 35 = cintura, 64 = cabeça.",
        FCVAR_NONE, true, 0.0, true, 80.0);

    // Espessura e duração deixaram de ser cvar: agora são do ESTILO, no
    // configs/lendas_vip_trilhas.cfg, porque variam de um estilo para outro.
    g_CvarSkinPadrao = CreateConVar("lendas_vip_skin_padrao", "0",
        "Skin de quem nunca escolheu. 0 = modelo padrão do jogo.",
        FCVAR_NONE, true, 0.0);

    AutoExecConfig(true, "lendas_vip", "sourcemod");

    // Os três nomes da 1.x continuam valendo: quem digita !vip não pode
    // descobrir que mudou de plugin.
    RegConsoleCmd("sm_vip", Comando_Menu, "Abre o painel VIP.");
    RegConsoleCmd("sm_menuvip", Comando_Menu, "Abre o painel VIP.");
    RegConsoleCmd("sm_vips", Comando_Vips, "Lista os VIPs online.");

    g_ckSkin = new Cookie("lendas_vip_skin", "Skin VIP escolhida", CookieAccess_Protected);
    g_ckTracer = new Cookie("lendas_vip_tracer", "Cor do rastro de tiro VIP", CookieAccess_Protected);
    g_ckTrilha = new Cookie("lendas_vip_trilha", "Cor da trilha do jogador VIP", CookieAccess_Protected);
    g_ckTrilhaEstilo = new Cookie("lendas_vip_trilha_estilo", "Estilo da trilha do jogador VIP", CookieAccess_Protected);

    HookEvent("player_spawn", Evento_Nasceu, EventHookMode_Post);
    HookEvent("bullet_impact", Evento_Tiro, EventHookMode_Post);

    // Sem isto a trilha fica pendurada no corpo caído e continua desenhando.
    HookEvent("player_death", Evento_Morreu, EventHookMode_Post);

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
 * `SetEntityModel` com um modelo não pré-carregado é uma das formas de o
 * jogador virar ERROR.
 */
public void OnMapStart()
{
    CarregarSkins();
    CarregarTrilhas();
    g_iModeloFeixe = PrecacheModel("materials/sprites/laserbeam.vmt", true);

    // Entidade de mapa anterior não sobrevive à troca; zerar as referências
    // evita o plugin tentar apagar algo que já não existe.
    for (int i = 1; i <= MAXPLAYERS; i++)
    {
        g_iTrilhaEnt[i] = INVALID_ENT_REFERENCE;
    }
}

/**
 * Lê os estilos de trilha e confere se o sprite de cada um existe.
 *
 * `FileExists` com o segundo parâmetro em `true` procura pelo sistema de
 * arquivos do JOGO, o que inclui o conteúdo dentro dos VPK — é o único jeito
 * de saber se um sprite padrão do CS:S está disponível, já que ele não existe
 * como arquivo solto no disco.
 *
 * Estilo com sprite ausente some do menu e vai para o log. Um sprite que não
 * carrega não deixa de desenhar: ele desenha o quadrado rosa de textura
 * faltando, atrás do jogador, o tempo todo.
 */
void CarregarTrilhas()
{
    g_nTrilhas = 0;

    char caminho[PLATFORM_MAX_PATH];
    BuildPath(Path_SM, caminho, sizeof(caminho), ARQUIVO_TRILHAS);

    KeyValues kv = new KeyValues("Trilhas");
    if (!kv.ImportFromFile(caminho) || !kv.GotoFirstSubKey())
    {
        delete kv;
        LogError("Não consegui ler os estilos de trilha em %s.", caminho);
        return;
    }

    char faltando[512];
    int nFaltando = 0;

    do
    {
        if (g_nTrilhas >= MAX_TRILHAS)
        {
            LogError("Mais de %d estilos de trilha; o resto foi ignorado.", MAX_TRILHAS);
            break;
        }

        char chave[16];
        kv.GetSectionName(chave, sizeof(chave));

        Trilha t;
        t.id = StringToInt(chave);
        kv.GetString("nome", t.nome, sizeof(t.nome), "sem nome");
        kv.GetString("sprite", t.sprite, sizeof(t.sprite), "");
        t.largura = kv.GetFloat("largura", 6.0);
        t.fim = kv.GetFloat("fim", 1.0);
        t.duracao = kv.GetFloat("duracao", 1.2);
        t.modo = kv.GetNum("modo", 5);

        if (t.id <= 0 || t.sprite[0] == 0)
        {
            LogError("Estilo de trilha '%s' ignorado: precisa de número e sprite.", chave);
            continue;
        }

        // O nome que o motor quer é o mesmo caminho sem o `materials/` da
        // frente. Aceitar as duas formas no arquivo de configuração evita que
        // um esquecimento de prefixo volte a apagar a trilha inteira.
        if (StrContains(t.sprite, "materials/", false) == 0)
        {
            strcopy(t.modelo, sizeof(t.modelo), t.sprite[10]);
        }
        else
        {
            strcopy(t.modelo, sizeof(t.modelo), t.sprite);
            Format(t.sprite, sizeof(t.sprite), "materials/%s", t.modelo);
        }

        t.existe = FileExists(t.sprite, true);
        if (t.existe)
        {
            PrecacheModel(t.modelo, true);
        }
        else
        {
            nFaltando++;
            if (faltando[0] != 0)
            {
                StrCat(faltando, sizeof(faltando), ", ");
            }
            StrCat(faltando, sizeof(faltando), t.nome);
        }

        g_Trilhas[g_nTrilhas] = t;
        g_nTrilhas++;
    }
    while (kv.GotoNextKey());

    delete kv;

    LogMessage("%d estilo(s) de trilha lidos, %d utilizáveis.",
        g_nTrilhas, g_nTrilhas - nFaltando);
    if (nFaltando > 0)
    {
        LogMessage("Sem o sprite nesta instalação, fora do menu: %s", faltando);
    }
}

int AcharTrilha(int id)
{
    for (int i = 0; i < g_nTrilhas; i++)
    {
        if (g_Trilhas[i].id == id)
        {
            return i;
        }
    }
    return -1;
}

/** Primeiro estilo utilizável, para quem nunca escolheu. */
int PrimeiraTrilhaUsavel()
{
    for (int i = 0; i < g_nTrilhas; i++)
    {
        if (g_Trilhas[i].existe)
        {
            return g_Trilhas[i].id;
        }
    }
    return 0;
}

public void OnClientCookiesCached(int client)
{
    g_iSkin[client] = LerCookie(client, g_ckSkin, g_CvarSkinPadrao.IntValue);
    g_iTracer[client] = LerCookie(client, g_ckTracer, 0);
    g_iTrilha[client] = LerCookie(client, g_ckTrilha, 0);
    g_iTrilhaEstilo[client] = LerCookie(client, g_ckTrilhaEstilo, PrimeiraTrilhaUsavel());
}

public void OnClientDisconnect(int client)
{
    ApagarTrilha(client);
    g_iSkin[client] = 0;
    g_iTracer[client] = 0;
    g_iTrilha[client] = 0;
    g_iTrilhaEstilo[client] = 0;
}

/**
 * Remove a trilha viva do jogador, se houver.
 *
 * A entidade é filha do jogador, e uma entidade filha não some sozinha em
 * todos os casos — sobra pendurada e vira lixo que se acumula a cada
 * nascimento. Apagar antes de criar a próxima é o que mantém uma só por
 * pessoa.
 */
void ApagarTrilha(int client)
{
    int ent = EntRefToEntIndex(g_iTrilhaEnt[client]);
    if (ent > 0 && IsValidEntity(ent))
    {
        AcceptEntityInput(ent, "Kill");
    }
    g_iTrilhaEnt[client] = INVALID_ENT_REFERENCE;
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
 * Falhar visivelmente no log é melhor que falhar na cara do jogador.
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
            LogError("Skin '%s' ignorada: precisa de número maior que zero e de um modelo.", chave);
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
    strcopy(destino, tamanho, (i == -1) ? "nenhuma" : g_Skins[i].nome);
}

void NomeDoEstilo(int id, char[] destino, int tamanho)
{
    int i = AcharTrilha(id);
    strcopy(destino, tamanho, (i == -1) ? "nenhum" : g_Trilhas[i].nome);
}

void NomeDoTracer(int cor, char[] destino, int tamanho)
{
    if (cor <= 0 || cor > sizeof(g_Cores))
    {
        strcopy(destino, tamanho, "desligado");
        return;
    }
    strcopy(destino, tamanho, g_Cores[cor - 1].nome);
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

    // Um instante de atraso: no momento do spawn o jogo ainda está definindo
    // time e modelo, e escrever antes disso é escrever por cima do que ele
    // vai escrever depois.
    CreateTimer(0.1, Timer_VestirSkin, GetClientUserId(client));
    CreateTimer(0.3, Timer_LigarTrilha, GetClientUserId(client));
}

public Action Timer_VestirSkin(Handle timer, any userid)
{
    int client = GetClientOfUserId(userid);
    if (client <= 0 || !IsClientInGame(client) || !IsPlayerAlive(client) || !EhVip(client))
    {
        return Plugin_Stop;
    }

    if (g_iSkin[client] == SEM_SKIN)
    {
        return Plugin_Stop;
    }

    int i = AcharSkin(g_iSkin[client]);
    if (i == -1 || !g_Skins[i].carregou)
    {
        return Plugin_Stop;
    }

    // A skin vale nos dois times. O `times` do arquivo só entra em cena na
    // exceção: skin marcada para um lado só não é vestida no outro.
    int time = GetClientTeam(client);
    if ((time == 2 && !g_Skins[i].valeTR) || (time == 3 && !g_Skins[i].valeCT))
    {
        return Plugin_Stop;
    }

    SetEntityModel(client, g_Skins[i].modelo);
    return Plugin_Stop;
}

/**
 * Liga a trilha que segue o jogador pelo mapa.
 *
 * POR QUE NÃO É MAIS `TE_SetupBeamFollow`
 *
 * Aquele efeito prende o feixe à ENTIDADE e não aceita deslocamento: ele
 * segue o centro do jogador, e o rastro saía na altura da cabeça. Não havia
 * o que configurar — é o que o efeito faz.
 *
 * `env_spritetrail` é uma entidade de verdade: dá para pendurá-la no jogador
 * e movê-la para onde se quiser depois. Daí a altura virar ajustável, e o
 * sprite, a espessura e a duração virarem escolha de estilo.
 *
 * A ordem importa: pendura primeiro (`SetParent`), move depois. Movida antes,
 * a posição seria no mundo e o `SetParent` a jogaria de volta para cima do
 * jogador; movida depois, o deslocamento é RELATIVO a ele e acompanha.
 */
public Action Timer_LigarTrilha(Handle timer, any userid)
{
    int client = GetClientOfUserId(userid);
    if (client <= 0 || !IsClientInGame(client))
    {
        return Plugin_Stop;
    }

    // Sempre limpa a anterior, mesmo quando não vai criar outra: quem
    // desligou a trilha no menu precisa ver a antiga sumir.
    ApagarTrilha(client);

    if (!IsPlayerAlive(client) || !EhVip(client))
    {
        return Plugin_Stop;
    }

    int cor = g_iTrilha[client];
    if (cor <= 0 || cor > sizeof(g_Cores))
    {
        return Plugin_Stop;
    }

    int i = AcharTrilha(g_iTrilhaEstilo[client]);
    if (i == -1 || !g_Trilhas[i].existe)
    {
        return Plugin_Stop;
    }

    int ent = CreateEntityByName("env_spritetrail");
    if (ent <= 0)
    {
        return Plugin_Stop;
    }

    char valor[64];

    // `modelo`, nunca `sprite`: ver o comentário do enum struct Trilha.
    DispatchKeyValue(ent, "spritename", g_Trilhas[i].modelo);
    FormatEx(valor, sizeof(valor), "%d %d %d",
        g_Cores[cor - 1].r, g_Cores[cor - 1].g, g_Cores[cor - 1].b);
    DispatchKeyValue(ent, "rendercolor", valor);
    DispatchKeyValue(ent, "renderamt", "255");

    FormatEx(valor, sizeof(valor), "%d", g_Trilhas[i].modo);
    DispatchKeyValue(ent, "rendermode", valor);

    DispatchKeyValueFloat(ent, "lifetime", g_Trilhas[i].duracao);
    DispatchKeyValueFloat(ent, "startwidth", g_Trilhas[i].largura);
    DispatchKeyValueFloat(ent, "endwidth", g_Trilhas[i].fim);

    DispatchSpawn(ent);
    ActivateEntity(ent);

    SetVariantString("!activator");
    AcceptEntityInput(ent, "SetParent", client);

    // Agora sim a altura, relativa ao jogador. A origem dele fica nos pés.
    float desloc[3];
    desloc[2] = g_CvarTrilhaAltura.FloatValue;
    TeleportEntity(ent, desloc, NULL_VECTOR, NULL_VECTOR);

    g_iTrilhaEnt[client] = EntIndexToEntRef(ent);
    return Plugin_Stop;
}

public void Evento_Morreu(Event evento, const char[] nome, bool naoTransmitir)
{
    int client = GetClientOfUserId(evento.GetInt("userid"));
    if (client > 0)
    {
        ApagarTrilha(client);
    }
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
        // Curto de propósito: o chat do CS:S descarta o que passa de ~127
        // bytes, e propaganda que ninguém lê não vende nada.
        PrintToChat(client, "\x04[LENDAS VIP]\x01 So para VIP: \x04%d skins\x01 e \x04%d cores\x01 de rastro de tiro.",
            ContarSkinsUsaveis(), sizeof(g_Cores));
        PrintToChat(client, "\x04[LENDAS VIP]\x01 Fale com um admin para pegar o seu.");
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

/**
 * O menu principal mostra o ESTADO antes das opções.
 *
 * Um menu que só lista ações obriga o jogador a entrar em cada uma para
 * lembrar o que escolheu. Com a skin e a cor no topo, quem abre o painel já
 * sabe onde está, e quem não quer mudar nada fecha na hora.
 */
void MenuPrincipal(int client)
{
    char skin[64], tracer[32], trilha[96];
    NomeDaSkin(g_iSkin[client], skin, sizeof(skin));
    NomeDoTracer(g_iTracer[client], tracer, sizeof(tracer));
    NomeDoTracer(g_iTrilha[client], trilha, sizeof(trilha));
    if (g_iTrilha[client] > 0)
    {
        // Cor sozinha não diz o que a pessoa vai ver; o estilo é metade da
        // informação.
        char estilo[64];
        NomeDoEstilo(g_iTrilhaEstilo[client], estilo, sizeof(estilo));
        Format(trilha, sizeof(trilha), "%s, %s", estilo, trilha);
    }

    char titulo[256];
    Format(titulo, sizeof(titulo),
        "PAINEL VIP  -  L.E.N.D.A.S\n \nSkin:              %s\nRastro de tiro:    %s\nTrilha:            %s\n ",
        skin, tracer, trilha);

    Menu menu = new Menu(Escolha_Principal);
    menu.SetTitle(titulo);

    menu.AddItem("skin", "Trocar minha skin");
    menu.AddItem("tracer", "Rastro de tiro - o feixe do disparo");
    menu.AddItem("trilha", "Trilha - o rastro que te segue andando");

    // Só oferece "tirar tudo" quando há o que tirar. Item que não faz nada é
    // ruído, e no menu do CS:S ruído custa uma linha das poucas que cabem.
    bool temAlgo = (g_iSkin[client] != SEM_SKIN) || (g_iTracer[client] > 0)
        || (g_iTrilha[client] > 0);
    menu.AddItem("limpar", "Tirar tudo e voltar ao normal",
        temAlgo ? ITEMDRAW_DEFAULT : ITEMDRAW_DISABLED);

    menu.AddItem("info", "O que o VIP me da");
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

    if (StrEqual(chave, "skin"))
    {
        MenuSkins(client);
    }
    else if (StrEqual(chave, "tracer"))
    {
        MenuTracers(client);
    }
    else if (StrEqual(chave, "trilha"))
    {
        MenuTrilha(client);
    }
    else if (StrEqual(chave, "limpar"))
    {
        g_iSkin[client] = SEM_SKIN;
        g_iTracer[client] = 0;
        g_iTrilha[client] = 0;
        GravarCookie(client, g_ckSkin, SEM_SKIN);
        GravarCookie(client, g_ckTracer, 0);
        GravarCookie(client, g_ckTrilha, 0);
        ApagarTrilha(client);
        PrintToChat(client, "\x04[LENDAS VIP]\x01 Tudo desligado. A skin sai no proximo nascimento.");
        MenuPrincipal(client);
    }
    else
    {
        MenuInfo(client);
    }
    return 0;
}

/**
 * Uma escolha só de skin, sem passar por time.
 *
 * A 2.0.0 perguntava antes se era para TR, CT ou ambos. Era uma pergunta que
 * o jogador não queria responder: ele quer um boneco, não uma matriz. A skin
 * agora vale nos dois times e o menu tem um passo a menos.
 */
void MenuSkins(int client)
{
    Menu menu = new Menu(Escolha_Skin);
    menu.SetTitle("ESCOLHA SUA SKIN\n \nVale nos dois times.\n ");

    char chave[8], linha[96];
    for (int i = 0; i < g_nSkins; i++)
    {
        // Skin sem o modelo no servidor não entra: escolher e virar ERROR é
        // pior do que ela não estar lá.
        if (!g_Skins[i].carregou)
        {
            continue;
        }

        // O que já está em uso vem marcado, para o jogador não precisar
        // decorar o que escolheu da última vez.
        if (g_Skins[i].id == g_iSkin[client])
        {
            Format(linha, sizeof(linha), "%s   [EM USO]", g_Skins[i].nome);
        }
        else
        {
            strcopy(linha, sizeof(linha), g_Skins[i].nome);
        }

        // Uma skin restrita a um lado precisa dizer isso ANTES de ser
        // escolhida, senão o jogador acha que ela quebrou quando troca de time.
        if (!g_Skins[i].valeTR)
        {
            StrCat(linha, sizeof(linha), " (so CT)");
        }
        else if (!g_Skins[i].valeCT)
        {
            StrCat(linha, sizeof(linha), " (so TR)");
        }

        IntToString(g_Skins[i].id, chave, sizeof(chave));
        menu.AddItem(chave, linha);
    }

    strcopy(linha, sizeof(linha), "Sem skin - modelo normal do jogo");
    if (g_iSkin[client] == SEM_SKIN)
    {
        StrCat(linha, sizeof(linha), "   [EM USO]");
    }
    menu.AddItem("0", linha);

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
        MenuPrincipal(client);
        return 0;
    }
    if (acao != MenuAction_Select)
    {
        return 0;
    }

    char chave[8];
    menu.GetItem(item, chave, sizeof(chave));
    int id = StringToInt(chave);

    g_iSkin[client] = id;
    GravarCookie(client, g_ckSkin, id);

    char nome[64];
    NomeDaSkin(id, nome, sizeof(nome));

    if (id == SEM_SKIN)
    {
        PrintToChat(client, "\x04[LENDAS VIP]\x01 Skin removida. Vale no proximo nascimento.");
    }
    else
    {
        PrintToChat(client, "\x04[LENDAS VIP]\x01 Skin: \x04%s\x01. Vale no proximo nascimento.", nome);
    }

    MenuPrincipal(client);
    return 0;
}

void MenuTracers(int client)
{
    Menu menu = new Menu(Escolha_Tracer);
    menu.SetTitle("COR DO RASTRO DE TIRO\n \nO feixe aparece por onde sua bala passou.\n ");

    char chave[8], linha[64];
    for (int i = 0; i < sizeof(g_Cores); i++)
    {
        strcopy(linha, sizeof(linha), g_Cores[i].nome);
        if (i + 1 == g_iTracer[client])
        {
            StrCat(linha, sizeof(linha), "   [EM USO]");
        }
        IntToString(i + 1, chave, sizeof(chave));
        menu.AddItem(chave, linha);
    }

    strcopy(linha, sizeof(linha), "Sem rastro");
    if (g_iTracer[client] <= 0)
    {
        StrCat(linha, sizeof(linha), "   [EM USO]");
    }
    menu.AddItem("0", linha);

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

/**
 * A trilha tem duas escolhas — estilo e cor —, então este menu é um hub.
 *
 * Juntar as duas num menu só daria estilos x cores itens: com 6 e 6, trinta e
 * seis linhas num painel que mostra sete. Separar é o que mantém a coisa
 * navegável.
 */
void MenuTrilha(int client)
{
    char estilo[64], cor[32];
    NomeDoEstilo(g_iTrilhaEstilo[client], estilo, sizeof(estilo));
    NomeDoTracer(g_iTrilha[client], cor, sizeof(cor));

    char titulo[192];
    Format(titulo, sizeof(titulo),
        "TRILHA DO JOGADOR\n \nEstilo:  %s\nCor:     %s\n ", estilo, cor);

    Menu menu = new Menu(Escolha_TrilhaHub);
    menu.SetTitle(titulo);
    menu.AddItem("estilo", "Trocar o estilo");
    menu.AddItem("cor", "Trocar a cor");
    menu.AddItem("off", "Desligar a trilha",
        g_iTrilha[client] > 0 ? ITEMDRAW_DEFAULT : ITEMDRAW_DISABLED);
    menu.ExitBackButton = true;
    menu.Display(client, MENU_TIME_FOREVER);
}

public int Escolha_TrilhaHub(Menu menu, MenuAction acao, int client, int item)
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

    if (StrEqual(chave, "estilo"))
    {
        MenuTrilhaEstilo(client);
    }
    else if (StrEqual(chave, "cor"))
    {
        MenuTrilhaCor(client);
    }
    else
    {
        g_iTrilha[client] = 0;
        GravarCookie(client, g_ckTrilha, 0);
        ApagarTrilha(client);
        PrintToChat(client, "\x04[LENDAS VIP]\x01 Trilha desligada.");
        MenuTrilha(client);
    }
    return 0;
}

void MenuTrilhaEstilo(int client)
{
    Menu menu = new Menu(Escolha_TrilhaEstilo);
    menu.SetTitle("ESTILO DA TRILHA\n ");

    char chave[8], linha[96];
    for (int i = 0; i < g_nTrilhas; i++)
    {
        // Estilo cujo sprite não existe nesta instalação fica de fora: ele
        // desenharia o quadrado rosa de textura faltando atrás do jogador.
        if (!g_Trilhas[i].existe)
        {
            continue;
        }
        strcopy(linha, sizeof(linha), g_Trilhas[i].nome);
        if (g_Trilhas[i].id == g_iTrilhaEstilo[client])
        {
            StrCat(linha, sizeof(linha), "   [EM USO]");
        }
        IntToString(g_Trilhas[i].id, chave, sizeof(chave));
        menu.AddItem(chave, linha);
    }

    menu.ExitBackButton = true;
    menu.Display(client, MENU_TIME_FOREVER);
}

public int Escolha_TrilhaEstilo(Menu menu, MenuAction acao, int client, int item)
{
    if (acao == MenuAction_End)
    {
        delete menu;
        return 0;
    }
    if (acao == MenuAction_Cancel && item == MenuCancel_ExitBack)
    {
        MenuTrilha(client);
        return 0;
    }
    if (acao != MenuAction_Select)
    {
        return 0;
    }

    char chave[8];
    menu.GetItem(item, chave, sizeof(chave));
    g_iTrilhaEstilo[client] = StringToInt(chave);
    GravarCookie(client, g_ckTrilhaEstilo, g_iTrilhaEstilo[client]);

    char nome[64];
    NomeDoEstilo(g_iTrilhaEstilo[client], nome, sizeof(nome));
    PrintToChat(client, "\x04[LENDAS VIP]\x01 Estilo da trilha: \x04%s\x01. Vale no proximo nascimento.", nome);

    MenuTrilha(client);
    return 0;
}

void MenuTrilhaCor(int client)
{
    Menu menu = new Menu(Escolha_Trilha);
    menu.SetTitle("COR DA TRILHA\n ");

    char chave[8], linha[64];
    for (int i = 0; i < sizeof(g_Cores); i++)
    {
        strcopy(linha, sizeof(linha), g_Cores[i].nome);
        if (i + 1 == g_iTrilha[client])
        {
            StrCat(linha, sizeof(linha), "   [EM USO]");
        }
        IntToString(i + 1, chave, sizeof(chave));
        menu.AddItem(chave, linha);
    }

    strcopy(linha, sizeof(linha), "Sem trilha");
    if (g_iTrilha[client] <= 0)
    {
        StrCat(linha, sizeof(linha), "   [EM USO]");
    }
    menu.AddItem("0", linha);

    menu.ExitBackButton = true;
    menu.Display(client, MENU_TIME_FOREVER);
}

public int Escolha_Trilha(Menu menu, MenuAction acao, int client, int item)
{
    if (acao == MenuAction_End)
    {
        delete menu;
        return 0;
    }
    if (acao == MenuAction_Cancel && item == MenuCancel_ExitBack)
    {
        MenuTrilha(client);
        return 0;
    }
    if (acao != MenuAction_Select)
    {
        return 0;
    }

    char chave[8];
    menu.GetItem(item, chave, sizeof(chave));
    int cor = StringToInt(chave);

    g_iTrilha[client] = cor;
    GravarCookie(client, g_ckTrilha, cor);

    char nome[32];
    NomeDoTracer(cor, nome, sizeof(nome));

    // A trilha se prende à vida do jogador, então trocar de cor no meio da
    // rodada não muda a que já está no ar. Dizer isso evita o "nao funcionou".
    if (cor > 0)
    {
        PrintToChat(client, "\x04[LENDAS VIP]\x01 Trilha: \x04%s\x01. Vale no proximo nascimento.", nome);
    }
    else
    {
        PrintToChat(client, "\x04[LENDAS VIP]\x01 Trilha desligada no proximo nascimento.");
    }

    MenuTrilha(client);
    return 0;
}

void MenuInfo(int client)
{
    Menu menu = new Menu(Escolha_Info);
    menu.SetTitle("O QUE O VIP TE DA\n ");

    char linha[96];

    Format(linha, sizeof(linha), "%d skins de jogador para escolher", ContarSkinsUsaveis());
    menu.AddItem("", linha, ITEMDRAW_DISABLED);

    Format(linha, sizeof(linha), "%d cores de rastro de tiro", sizeof(g_Cores));
    menu.AddItem("", linha, ITEMDRAW_DISABLED);

    Format(linha, sizeof(linha), "%d estilos de trilha em %d cores",
        ContarTrilhasUsaveis(), sizeof(g_Cores));
    menu.AddItem("", linha, ITEMDRAW_DISABLED);

    menu.AddItem("", "Sua escolha fica salva entre partidas", ITEMDRAW_DISABLED);
    menu.AddItem("", "Mais coisas chegando em breve", ITEMDRAW_DISABLED);

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

int ContarTrilhasUsaveis()
{
    int n = 0;
    for (int i = 0; i < g_nTrilhas; i++)
    {
        if (g_Trilhas[i].existe)
        {
            n++;
        }
    }
    return n;
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

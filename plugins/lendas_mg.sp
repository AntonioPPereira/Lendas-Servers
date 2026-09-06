#pragma semicolon 1
#pragma newdecls required

#include <sourcemod>

#define PLUGIN_VERSION "1.0.0"

/** Lista de padrões de nome de mapa que ligam o modo sozinhos. */
#define ARQUIVO_MAPAS "configs/lendas_mg_maps.cfg"

/**
 * Modo minigame: uma configuração de brincadeira para os mapas de minigame.
 *
 * O servidor já tinha o `!mix`, que é o mesmo desenho: o plugin do abnermix
 * executa `abnermix/cpl.cfg` quando a partida começa e `abnermix/mixend.cfg`
 * quando acaba. Aqui é igual, só que o gatilho é o MAPA — quem entra num
 * `mg_` não precisa pedir a ninguém para ligar o bunnyhop.
 *
 * Por que um plugin e não `cfg/<nome do mapa>.cfg`, que a engine já executa
 * sozinha: aquele caminho exige um arquivo por mapa e, principalmente, não
 * tem volta. O `sv_enablebunnyhopping` não está no `server.cfg`, então nada
 * o devolveria ao normal na próxima troca de mapa — o servidor sairia do
 * minigame com o bunnyhop ligado no meio de um mix.
 *
 * Daí a única regra de estado que importa aqui: o cfg de desligar só roda
 * quando o modo REALMENTE estava ligado. Em mapa normal, com o modo
 * desligado, este plugin não escreve um cvar sequer, e não tem como
 * atropelar o mix.
 */
public Plugin myinfo =
{
    name = "[LENDAS] Modo Minigame",
    author = "LENDAS / Codex",
    description = "Liga uma configuração de brincadeira nos mapas de minigame e a desfaz ao sair deles.",
    version = PLUGIN_VERSION,
    url = ""
};

ConVar g_CvarAuto;
ConVar g_CvarCfgLiga;
ConVar g_CvarCfgDesliga;
ConVar g_CvarAviso;
ConVar g_CvarDebug;

/** O modo está ligado agora? */
bool g_bLigado;

/** O mapa atual bate com a lista? */
bool g_bMapaDeMinigame;

/** Um admin mandou ligar ou desligar à mão, contrariando a lista. */
bool g_bDecisaoManual;

char g_sMapa[64];

/** Padrões lidos do arquivo. Um `*` no fim vale como "começa com". */
ArrayList g_alPadroes;

public void OnPluginStart()
{
    CreateConVar("lendas_mg_version", PLUGIN_VERSION, "Versão do [LENDAS] Modo Minigame.",
        FCVAR_NOTIFY | FCVAR_DONTRECORD);

    g_CvarAuto = CreateConVar("lendas_mg_auto", "1",
        "Liga o modo sozinho nos mapas da lista. 0 = só no comando sm_mg.",
        FCVAR_NONE, true, 0.0, true, 1.0);
    g_CvarCfgLiga = CreateConVar("lendas_mg_cfg", "lendas/mg_on.cfg",
        "Configuração executada ao entrar no modo minigame, relativa a cfg/.");
    g_CvarCfgDesliga = CreateConVar("lendas_mg_cfg_fim", "lendas/mg_off.cfg",
        "Configuração executada ao sair do modo minigame, relativa a cfg/.");
    g_CvarAviso = CreateConVar("lendas_mg_aviso", "1",
        "Anuncia no chat quando o modo liga ou desliga. 0 = calado.",
        FCVAR_NONE, true, 0.0, true, 1.0);
    g_CvarDebug = CreateConVar("lendas_mg_debug", "0",
        "Registra no console do servidor a decisão tomada em cada mapa.",
        FCVAR_NONE, true, 0.0, true, 1.0);

    AutoExecConfig(true, "lendas_mg", "sourcemod");

    RegAdminCmd("sm_mg", Comando_Mg, ADMFLAG_GENERIC,
        "Liga ou desliga o modo minigame. sm_mg 1 liga, sm_mg 0 desliga, sm_mg alterna.");

    g_alPadroes = new ArrayList(64);
}

public void OnMapStart()
{
    GetCurrentMap(g_sMapa, sizeof(g_sMapa));
    CarregarPadroes();
    g_bMapaDeMinigame = MapaBateComALista(g_sMapa);

    // O mapa novo desfaz qualquer decisão manual do mapa anterior: quem
    // desligou o modo à mão não quis desligá-lo para sempre.
    g_bDecisaoManual = false;
}

/**
 * Ponto certo para mexer em cvar.
 *
 * O SourceMod chama isto depois que o `server.cfg` e os cfg de mapa já
 * rodaram. Ligar antes disso seria escrever valores que o `server.cfg`
 * apagaria em seguida.
 */
public void OnConfigsExecuted()
{
    if (g_bDecisaoManual)
    {
        return;
    }

    bool queremos = g_CvarAuto.BoolValue && g_bMapaDeMinigame;

    if (g_CvarDebug.BoolValue)
    {
        LogMessage("mapa '%s': na lista=%d, auto=%d, ligado agora=%d",
            g_sMapa, g_bMapaDeMinigame, g_CvarAuto.BoolValue, g_bLigado);
    }

    if (queremos)
    {
        AplicarModo(true, "mapa de minigame");
    }
    else if (g_bLigado)
    {
        // Só desfaz o que este plugin fez. Em mapa normal com o modo já
        // desligado, nada acontece — nenhum cvar é tocado.
        AplicarModo(false, "mapa comum");
    }
}

public Action Comando_Mg(int client, int args)
{
    bool alvo = !g_bLigado;
    if (args >= 1)
    {
        char arg[8];
        GetCmdArg(1, arg, sizeof(arg));
        alvo = (StringToInt(arg) != 0);
    }

    if (alvo == g_bLigado)
    {
        ReplyToCommand(client, "[LENDAS] O modo minigame já está %s.",
            g_bLigado ? "ligado" : "desligado");
        return Plugin_Handled;
    }

    // A escolha do admin vale até a próxima troca de mapa. Sem esta marca, o
    // `OnConfigsExecuted` do mapa seguinte já desfaria a decisão, e o admin
    // que desligou o modo num `mg_` o veria voltar sozinho.
    g_bDecisaoManual = true;
    AplicarModo(alvo, client > 0 ? "pedido de admin" : "pedido do console");
    return Plugin_Handled;
}

/**
 * Executa o cfg do modo e guarda o estado novo.
 *
 * O `exec` da engine não é imediato: ele entra na fila de comandos e roda no
 * quadro seguinte. Isso não atrapalha nada aqui, mas explica por que o valor
 * de um cvar lido logo depois desta função ainda é o antigo.
 */
void AplicarModo(bool ligar, const char[] motivo)
{
    char cfg[PLATFORM_MAX_PATH];
    if (ligar)
    {
        g_CvarCfgLiga.GetString(cfg, sizeof(cfg));
    }
    else
    {
        g_CvarCfgDesliga.GetString(cfg, sizeof(cfg));
    }

    if (cfg[0] == '\0')
    {
        LogError("Nenhuma configuração definida para %s o modo minigame.",
            ligar ? "ligar" : "desligar");
        return;
    }

    ServerCommand("exec \"%s\"", cfg);
    g_bLigado = ligar;

    LogMessage("modo minigame %s (%s) — executando %s",
        ligar ? "LIGADO" : "desligado", motivo, cfg);

    if (!g_CvarAviso.BoolValue)
    {
        return;
    }

    // O chat do CS:S descarta mensagem longa demais. Estas ficam curtas de
    // propósito; ver o mesmo cuidado no lendas_spec.
    if (ligar)
    {
        PrintToChatAll("\x04[LENDAS]\x01 Modo \x04MINIGAME\x01 ligado: bunnyhop liberado, sem dano entre amigos.");
    }
    else
    {
        PrintToChatAll("\x04[LENDAS]\x01 Modo minigame desligado. Configuração normal de volta.");
    }
}

/**
 * Lê a lista de mapas do disco.
 *
 * É relido a cada mapa de propósito: assim dá para acrescentar um mapa na
 * lista sem recarregar o plugin nem reiniciar o servidor.
 */
void CarregarPadroes()
{
    g_alPadroes.Clear();

    char caminho[PLATFORM_MAX_PATH];
    BuildPath(Path_SM, caminho, sizeof(caminho), ARQUIVO_MAPAS);

    File arquivo = OpenFile(caminho, "r");
    if (arquivo == null)
    {
        LogError("Não achei %s — nenhum mapa liga o modo minigame sozinho.", caminho);
        return;
    }

    char linha[64];
    while (arquivo.ReadLine(linha, sizeof(linha)))
    {
        // Corta comentário e espaço em branco das pontas.
        int comentario = StrContains(linha, "//");
        if (comentario != -1)
        {
            linha[comentario] = '\0';
        }
        TrimString(linha);

        if (linha[0] != '\0')
        {
            g_alPadroes.PushString(linha);
        }
    }
    delete arquivo;

    if (g_CvarDebug.BoolValue)
    {
        LogMessage("lista de minigame: %d padrões lidos de %s", g_alPadroes.Length, caminho);
    }
}

bool MapaBateComALista(const char[] mapa)
{
    char padrao[64];
    for (int i = 0; i < g_alPadroes.Length; i++)
    {
        g_alPadroes.GetString(i, padrao, sizeof(padrao));

        int fim = strlen(padrao) - 1;
        if (fim >= 0 && padrao[fim] == '*')
        {
            // "mg_*" casa com tudo que começa com "mg_".
            padrao[fim] = '\0';
            if (strncmp(mapa, padrao, strlen(padrao), false) == 0)
            {
                return true;
            }
        }
        else if (StrEqual(mapa, padrao, false))
        {
            return true;
        }
    }
    return false;
}

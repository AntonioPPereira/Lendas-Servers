#pragma semicolon 1
#pragma newdecls required

#include <sourcemod>
// AddFileToDownloadsTable mora aqui, não no core.
#include <sdktools>

#define PLUGIN_VERSION "1.0.0"

/** Lista de arquivos que o cliente precisa baixar. */
#define ARQUIVO_LISTA "configs/lendas_downloads.cfg"

/**
 * Manda o cliente baixar o conteúdo customizado do servidor.
 *
 * POR QUE ISTO EXISTE
 *
 * As skins do `lendas_vip` apareciam como ERROR para todo mundo. O plugin do
 * VIP chama `PrecacheModel` e `SetEntityModel` — ou seja, o SERVIDOR carrega
 * o modelo e o veste no jogador — mas **não chama `AddFileToDownloadsTable`**.
 * Sem isso o cliente nunca é avisado de que existe algo para baixar, não tem
 * o arquivo, e desenha o boneco de ERROR.
 *
 * Conferido lendo os 51 natives do `.smx` dele, que não tem fonte. Os
 * arquivos estavam todos no servidor e no FastDL: o que faltava era o convite.
 *
 * POR QUE UM PLUGIN SEPARADO
 *
 * O `lendas_vip` não tem fonte. Reescrevê-lo do zero para acrescentar uma
 * chamada seria arriscar o resto do que ele faz. Este plugin resolve por
 * fora, não encosta nele, e serve para qualquer conteúdo customizado que
 * venha depois — skin nova, som, sprite.
 *
 * A LISTA É MÍNIMA DE PROPÓSITO
 *
 * A pasta de materiais de uma das skins tem 73 arquivos e 257 MB, mas o
 * modelo usa 9 materiais. Mandar a pasta inteira faria cada jogador baixar
 * 257 MB de textura de roupa que o modelo nem tem. A lista foi montada
 * lendo o que cada `.mdl` pede e o que cada `.vmt` referencia.
 */
public Plugin myinfo =
{
    name = "[LENDAS] Downloads",
    author = "LENDAS / Codex",
    description = "Registra o conteúdo customizado na tabela de downloads para o cliente baixar.",
    version = PLUGIN_VERSION,
    url = ""
};

ConVar g_CvarPrecache;
ConVar g_CvarDebug;

public void OnPluginStart()
{
    CreateConVar("lendas_downloads_version", PLUGIN_VERSION,
        "Versão do [LENDAS] Downloads.", FCVAR_NOTIFY | FCVAR_DONTRECORD);

    g_CvarPrecache = CreateConVar("lendas_downloads_precache", "1",
        "Também pré-carrega os modelos (.mdl) da lista. 0 = só registra o download.",
        FCVAR_NONE, true, 0.0, true, 1.0);
    g_CvarDebug = CreateConVar("lendas_downloads_debug", "0",
        "Escreve no log cada arquivo registrado, não só o resumo.",
        FCVAR_NONE, true, 0.0, true, 1.0);

    AutoExecConfig(true, "lendas_downloads", "sourcemod");

    RegAdminCmd("sm_downloads_recarregar", Comando_Recarregar, ADMFLAG_CONFIG,
        "Relê a lista de downloads e informa o que falta no disco.");
}

/**
 * A tabela de downloads é limpa a cada mapa, então tem de ser preenchida a
 * cada mapa. Fazer isso no `OnPluginStart` funcionaria só no primeiro.
 */
public void OnMapStart()
{
    CarregarLista(0);
}

public Action Comando_Recarregar(int client, int args)
{
    int faltando = CarregarLista(client);
    ReplyToCommand(client, "[LENDAS] Lista relida. %d arquivo(s) faltando no disco.",
        faltando);
    return Plugin_Handled;
}

/**
 * Lê a lista e registra cada arquivo.
 *
 * Devolve quantos arquivos da lista NÃO existem no disco. Isso importa mais
 * do que parece: `AddFileToDownloadsTable` aceita um caminho inexistente sem
 * reclamar, e o cliente só descobre o problema desenhando um ERROR. Conferir
 * aqui é a diferença entre saber e adivinhar.
 */
int CarregarLista(int quemPediu)
{
    char caminho[PLATFORM_MAX_PATH];
    BuildPath(Path_SM, caminho, sizeof(caminho), ARQUIVO_LISTA);

    File arquivo = OpenFile(caminho, "r");
    if (arquivo == null)
    {
        LogError("Não achei %s — nenhum conteúdo customizado será baixado.", caminho);
        return -1;
    }

    bool precachear = g_CvarPrecache.BoolValue;
    bool debug = g_CvarDebug.BoolValue;

    int registrados = 0;
    int precacheados = 0;
    int faltando = 0;

    char linha[PLATFORM_MAX_PATH];
    while (arquivo.ReadLine(linha, sizeof(linha)))
    {
        int comentario = StrContains(linha, "//");
        if (comentario != -1)
        {
            linha[comentario] = 0;
        }
        TrimString(linha);

        if (linha[0] == 0)
        {
            continue;
        }

        if (!FileExists(linha))
        {
            faltando++;
            LogError("Na lista mas não está no disco: %s", linha);
            if (quemPediu > 0)
            {
                PrintToConsole(quemPediu, "[LENDAS] FALTA no disco: %s", linha);
            }
            continue;
        }

        AddFileToDownloadsTable(linha);
        registrados++;

        // O .mdl também precisa estar pré-carregado para o servidor poder
        // vesti-lo em alguém. O VIP já faz isso para os dele; aqui é rede de
        // segurança, e cobre skin que venha a ser usada por outro plugin.
        if (precachear && StrEndsWith(linha, ".mdl"))
        {
            PrecacheModel(linha, true);
            precacheados++;
        }

        if (debug)
        {
            LogMessage("registrado: %s", linha);
        }
    }
    delete arquivo;

    LogMessage("%d arquivo(s) registrados para download, %d modelo(s) pré-carregados, %d faltando.",
        registrados, precacheados, faltando);

    return faltando;
}

bool StrEndsWith(const char[] texto, const char[] fim)
{
    int nTexto = strlen(texto);
    int nFim = strlen(fim);
    if (nFim > nTexto)
    {
        return false;
    }
    return StrEqual(texto[nTexto - nFim], fim, false);
}

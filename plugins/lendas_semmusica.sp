#pragma semicolon 1
#pragma newdecls required

#include <sourcemod>
#include <sdktools>

#define PLUGIN_VERSION "1.0.0"

/** Bandeira 1 do ambient_generic: "Play everywhere", ignora distância. */
#define TOCA_EM_TODO_LUGAR 1

/**
 * Cala a música de fundo dos mapas, sem calar os sons de jogo.
 *
 * DE ONDE VEM A MÚSICA
 *
 * Não é de plugin. Cada mapa de minigame traz a trilha embutida dentro do
 * próprio `.bsp`, numa entidade `ambient_generic` marcada como "toca em todo
 * lugar" — ela ignora distância e toca no servidor inteiro. Por isso desligar
 * plugin de som não resolve: o mapa é o dono do som.
 *
 * COMO SEPARAR MÚSICA DE SOM DE JOGO
 *
 * Pelo TAMANHO do arquivo, e não pelo nome. Nos mapas instalados aqui a
 * separação é limpa e não é sutil:
 *
 *     som de jogo   9 KB a 235 KB   (kart_lap, kart_banana, explosão)
 *     música        1 MB a 18 MB    (Benny Hill, Tetris, voyagefinal)
 *
 * Filtrar por nome exigiria conhecer cada mapa e falharia no próximo. O
 * tamanho é uma propriedade do arquivo, e vale para mapa que ainda não foi
 * instalado.
 *
 * A entidade também precisa estar marcada como "toca em todo lugar": um som
 * grande preso a um lugar do mapa é ambiente, não trilha, e some sozinho
 * quando o jogador se afasta.
 *
 * O PLUGIN CONTA O QUE VIU
 *
 * Cada `ambient_generic` examinado vai para o log com nome e tamanho, mesmo o
 * que ele deixou tocar. É isso que permite ajustar o limite com base no que
 * existe de verdade, em vez de chutar — e descobrir, no mapa novo, que a
 * música dele tem 400 KB e passou batido.
 */
public Plugin myinfo =
{
    name = "[LENDAS] Sem Musica de Mapa",
    author = "LENDAS / Codex",
    description = "Cala a trilha sonora embutida nos mapas, mantendo os sons de jogo.",
    version = PLUGIN_VERSION,
    url = ""
};

ConVar g_CvarAtivo;
ConVar g_CvarMinimoKB;
ConVar g_CvarDebug;

public void OnPluginStart()
{
    CreateConVar("lendas_semmusica_version", PLUGIN_VERSION,
        "Versão do [LENDAS] Sem Musica de Mapa.", FCVAR_NOTIFY | FCVAR_DONTRECORD);

    g_CvarAtivo = CreateConVar("lendas_semmusica_ativo", "1",
        "Cala a música de fundo dos mapas. 0 = deixa o mapa tocar o que quiser.",
        FCVAR_NONE, true, 0.0, true, 1.0);

    g_CvarMinimoKB = CreateConVar("lendas_semmusica_minimo_kb", "600",
        "Som acima deste tamanho, em KB, e que toca em todo lugar, é tratado como música. Nos mapas daqui, som de jogo vai até 235 KB e música começa em 1 MB.",
        FCVAR_NONE, true, 50.0);

    g_CvarDebug = CreateConVar("lendas_semmusica_debug", "0",
        "Registra TODO ambient_generic examinado, não só os calados.",
        FCVAR_NONE, true, 0.0, true, 1.0);

    AutoExecConfig(true, "lendas_semmusica", "sourcemod");

    RegAdminCmd("sm_semmusica", Comando_Agora, ADMFLAG_GENERIC,
        "Varre o mapa atual de novo e cala a música que estiver tocando.");
}

/**
 * Espera as entidades do mapa existirem.
 *
 * No `OnMapStart` elas ainda não nasceram todas; varrer ali acharia pouco ou
 * nada. Dois segundos depois o mapa está montado — e se a música já começou,
 * o `StopSound` corta no meio.
 */
public void OnConfigsExecuted()
{
    CreateTimer(2.0, Timer_Varrer);
}

public Action Timer_Varrer(Handle timer)
{
    Varrer(0);
    return Plugin_Stop;
}

public Action Comando_Agora(int client, int args)
{
    int n = Varrer(client);
    ReplyToCommand(client, "[LENDAS] %d som(ns) de música calados.", n);
    return Plugin_Handled;
}

/**
 * Tira o `#`, `*` e afins do começo do nome do som.
 *
 * O Source usa esses caracteres como instrução: `#` toca como música (canal
 * separado, volume do `snd_musicvolume`), `*` toca em fluxo, `)` é som
 * espacial. Nenhum deles faz parte do caminho, e o arquivo não é encontrado
 * enquanto estiverem ali.
 */
void LimparNome(const char[] bruto, char[] destino, int tamanho)
{
    int i = 0;
    while (bruto[i] == '#' || bruto[i] == '*' || bruto[i] == ')'
        || bruto[i] == '^' || bruto[i] == '@' || bruto[i] == '<'
        || bruto[i] == '>' || bruto[i] == '+' || bruto[i] == '~'
        || bruto[i] == '!')
    {
        i++;
    }
    strcopy(destino, tamanho, bruto[i]);
}

int Varrer(int quemPediu)
{
    if (!g_CvarAtivo.BoolValue)
    {
        return 0;
    }

    int limite = g_CvarMinimoKB.IntValue * 1024;
    bool debug = g_CvarDebug.BoolValue;

    int calados = 0;
    int vistos = 0;

    int ent = -1;
    while ((ent = FindEntityByClassname(ent, "ambient_generic")) != -1)
    {
        char bruto[PLATFORM_MAX_PATH];
        GetEntPropString(ent, Prop_Data, "m_iszSound", bruto, sizeof(bruto));
        if (bruto[0] == 0)
        {
            continue;
        }
        vistos++;

        char nome[PLATFORM_MAX_PATH];
        LimparNome(bruto, nome, sizeof(nome));

        char caminho[PLATFORM_MAX_PATH];
        FormatEx(caminho, sizeof(caminho), "sound/%s", nome);

        // O conteúdo embutido do mapa é montado no sistema de arquivos do
        // jogo quando ele carrega, então o som de dentro do .bsp é
        // encontrado por aqui como se fosse um arquivo solto.
        int tam = FileSize(caminho, true);

        int bandeiras = GetEntProp(ent, Prop_Data, "m_spawnflags");
        bool todoLugar = (bandeiras & TOCA_EM_TODO_LUGAR) != 0;
        bool grande = (tam > limite);

        if (debug || (todoLugar && grande))
        {
            LogMessage("ambient_generic: %s — %s KB, %s%s",
                nome,
                tam < 0 ? "tamanho desconhecido" : FormatarKB(tam),
                todoLugar ? "toca em todo lugar" : "preso ao lugar",
                (todoLugar && grande) ? "  -> CALADO" : "");
        }

        if (!todoLugar || !grande)
        {
            continue;
        }

        // StopSound antes de remover: se a música já começou, ela para agora.
        // Só apagar a entidade deixaria o som tocando até o fim.
        AcceptEntityInput(ent, "StopSound");
        AcceptEntityInput(ent, "Kill");
        calados++;

        if (quemPediu > 0)
        {
            PrintToConsole(quemPediu, "[LENDAS] calado: %s", nome);
        }
    }

    LogMessage("varredura de música: %d ambient_generic no mapa, %d calado(s).",
        vistos, calados);
    return calados;
}

/** Só para o log ficar legível: 18534400 vira "18100". */
char[] FormatarKB(int bytes)
{
    char saida[16];
    IntToString(bytes / 1024, saida, sizeof(saida));
    return saida;
}

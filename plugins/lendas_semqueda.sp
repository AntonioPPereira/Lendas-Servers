#pragma semicolon 1
#pragma newdecls required

#include <sourcemod>
#include <sdkhooks>

#define PLUGIN_VERSION "1.0.0"

/**
 * Tira o dano de queda.
 *
 * POR QUE NÃO BASTA O CVAR
 *
 * O `mp_falldamage 0` está no `mg_on.cfg` desde o primeiro dia e nunca fez
 * nada. Ele EXISTE no binário do servidor, o que me enganou quando conferi a
 * configuração: aparece ali no meio de `mp_teamplay`, `mp_weaponstay`,
 * `mp_forcerespawn` e `mp_allowNPCs` — todos herdados do Half-Life 2 por
 * código compartilhado. O CS:S carrega o nome e ignora o valor, porque
 * calcula o dano de queda no próprio código do jogador.
 *
 * É o mesmo engano do `sv_full_alltalk`, e a lição se repete: um cvar
 * aparecer no binário prova que o NOME existe, não que o jogo o obedece.
 *
 * COMO FUNCIONA
 *
 * O plugin escuta o dano e recusa o que vier marcado como queda. Não mexe em
 * gravidade nem em velocidade: o jogador cai igual, faz o mesmo barulho, só
 * não perde vida.
 *
 * O QUE ELE NÃO BLOQUEIA, DE PROPÓSITO
 *
 * Só o dano de QUEDA. Espinho, fogo, água ácida e o resto dos perigos de mapa
 * de percurso chegam com outra marca e continuam machucando — senão o mapa
 * perderia a graça inteira, que não é o que foi pedido.
 */
public Plugin myinfo =
{
    name = "[LENDAS] Sem Dano de Queda",
    author = "LENDAS / Codex",
    description = "Impede o dano de queda, sem mexer no resto dos perigos do mapa.",
    version = PLUGIN_VERSION,
    url = ""
};

ConVar g_CvarAtivo;

public void OnPluginStart()
{
    CreateConVar("lendas_semqueda_version", PLUGIN_VERSION,
        "Versão do [LENDAS] Sem Dano de Queda.", FCVAR_NOTIFY | FCVAR_DONTRECORD);

    g_CvarAtivo = CreateConVar("lendas_semqueda_ativo", "1",
        "1 = ninguém toma dano de queda. 0 = comportamento normal do jogo.",
        FCVAR_NONE, true, 0.0, true, 1.0);

    AutoExecConfig(true, "lendas_semqueda", "sourcemod");

    // Quem já está jogando quando o plugin carrega também precisa do gancho.
    for (int i = 1; i <= MaxClients; i++)
    {
        if (IsClientInGame(i))
        {
            OnClientPutInServer(i);
        }
    }
}

public void OnClientPutInServer(int client)
{
    SDKHook(client, SDKHook_OnTakeDamage, Gancho_Dano);
}

/**
 * Recusa o dano quando ele vem marcado como queda.
 *
 * `Plugin_Handled` cancela o dano inteiro. Zerar o valor e deixar passar
 * daria quase no mesmo, mas ainda dispararia o efeito de tela e o som de
 * machucado — e o jogador acharia que levou dano mesmo sem perder vida.
 */
public Action Gancho_Dano(int vitima, int &agressor, int &lancador, float &dano,
                          int &tipo, int &arma, float forca[3], float posicao[3])
{
    if (!g_CvarAtivo.BoolValue)
    {
        return Plugin_Continue;
    }

    if (tipo & DMG_FALL)
    {
        return Plugin_Handled;
    }

    return Plugin_Continue;
}

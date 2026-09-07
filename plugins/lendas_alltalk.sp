#pragma semicolon 1
#pragma newdecls required

#include <sourcemod>

#define PLUGIN_VERSION "1.0.0"

/**
 * Mantém o `sv_alltalk` ligado, aconteça o que acontecer.
 *
 * POR QUE NÃO BASTA PÔR 1 NA CONFIGURAÇÃO
 *
 * Ele já estava 1 no `server.cfg` e nos três cfg de minigame. O problema não é
 * onde ele começa, é quem o muda depois:
 *
 *   - o `funvotes` está ativo e oferece votação para desligar o alltalk, e a
 *     mudança **persiste até a próxima troca de mapa**;
 *   - `mr15.cfg`, `mr3.cfg` e `abnermix/cpl.cfg` põem `sv_alltalk 0`, e basta
 *     um `exec` à mão para o servidor mudar sem ninguém entender por quê;
 *   - um mapa pode mexer nisso por `point_servercommand`, como vários já
 *     mexem em outros cvars.
 *
 * Escrever 1 em mais um arquivo não cobre nenhum dos três: todos acontecem
 * DEPOIS que os arquivos rodaram. O que cobre é vigiar o valor.
 *
 * COMO FUNCIONA
 *
 * O plugin escuta a mudança do cvar e devolve o valor na hora. Não fica
 * verificando por quadro nem por temporizador: o gancho só é chamado quando
 * alguém realmente mexe, então o custo é zero enquanto ninguém mexe.
 *
 * A devolução é registrada no log com o valor que tentaram pôr. Se um dia
 * alguém reclamar que "a votação de alltalk não funciona", o log explica.
 */
public Plugin myinfo =
{
    name = "[LENDAS] Alltalk Sempre",
    author = "LENDAS / Codex",
    description = "Devolve o sv_alltalk para ligado sempre que algo tenta desligá-lo.",
    version = PLUGIN_VERSION,
    url = ""
};

ConVar g_CvarGuarda;
ConVar g_CvarAlltalk;

/** Evita o gancho reagir à própria escrita e entrar em laço. */
bool g_bEuQueMudei;

public void OnPluginStart()
{
    CreateConVar("lendas_alltalk_version", PLUGIN_VERSION,
        "Versão do [LENDAS] Alltalk Sempre.", FCVAR_NOTIFY | FCVAR_DONTRECORD);

    g_CvarGuarda = CreateConVar("lendas_alltalk_forcar", "1",
        "1 = o sv_alltalk volta para ligado sempre que algo o desliga. 0 = deixa mudarem.",
        FCVAR_NONE, true, 0.0, true, 1.0);

    AutoExecConfig(true, "lendas_alltalk", "sourcemod");

    g_CvarAlltalk = FindConVar("sv_alltalk");
    if (g_CvarAlltalk == null)
    {
        SetFailState("sv_alltalk não existe neste servidor — nada a vigiar.");
    }

    g_CvarAlltalk.AddChangeHook(Mudou_Alltalk);
}

/**
 * O SourceMod chama isto DEPOIS de o valor já ter mudado.
 *
 * Por isso a correção é escrever de volta, e não recusar a mudança: não
 * existe como recusar. Quem tentou desligar vê o próprio comando aceito e o
 * valor voltando em seguida.
 */
public void Mudou_Alltalk(ConVar cvar, const char[] anterior, const char[] novo)
{
    if (g_bEuQueMudei || !g_CvarGuarda.BoolValue)
    {
        return;
    }

    if (cvar.BoolValue)
    {
        return;   // ligaram, ou já estava ligado: nada a fazer
    }

    g_bEuQueMudei = true;
    cvar.SetInt(1);
    g_bEuQueMudei = false;

    LogMessage("sv_alltalk foi mudado de '%s' para '%s' e devolvido para 1 (lendas_alltalk_forcar).",
        anterior, novo);
}

/**
 * Garante o valor certo no começo de cada mapa.
 *
 * O gancho cobre quem MUDA o cvar, mas não cobre o caso de o mapa começar com
 * ele desligado — se um cfg rodar antes deste plugin carregar, a mudança
 * acontece sem gancho para ouvir.
 */
public void OnConfigsExecuted()
{
    if (g_CvarGuarda.BoolValue && !g_CvarAlltalk.BoolValue)
    {
        g_bEuQueMudei = true;
        g_CvarAlltalk.SetInt(1);
        g_bEuQueMudei = false;
        LogMessage("mapa começou com sv_alltalk desligado; devolvido para 1.");
    }
}

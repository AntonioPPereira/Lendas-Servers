#pragma semicolon 1
#pragma newdecls required

#include <sourcemod>
#include <sdktools>

#define PLUGIN_VERSION "1.0.0"

/**
 * Limpa efeito de tela que ficou preso no jogador.
 *
 * O PROBLEMA, MEDIDO NO mg_ka_trains_detach_evo_v2_3
 *
 * O mapa tem um sorteio de modos (`logic_case` chamado `choix_aleatoire`) e um
 * `point_servercommand`. Ao cair no BLIND MODE ele dispara, do console do
 * servidor:
 *
 *     sm_blind @all 253
 *
 * O `sm_blind` do funcommands manda uma mensagem `Fade` com as flags
 * `FFADE_OUT | FFADE_STAYOUT` (0x0002 | 0x0008). O STAYOUT e literal: o preto
 * fica ate alguem mandar tirar. E o funcommands **nao tem gancho nenhum** de
 * morte, renascimento ou inicio de round -- conferido no fonte, o blind.sp so
 * tem a funcao que aplica. Nada nunca desfaz.
 *
 * No mapa inteiro nao existe um `sm_blind @all 0`. Entao o modo nao acaba: ele
 * so para de incomodar quem, por sorte, pegar o DRUG MODE depois -- porque o
 * `KillDrug` manda um fade com `FFADE_PURGE`, que limpa a fila toda de quebra.
 * E por isso que o sintoma pegava so ALGUNS jogadores, e nao o servidor
 * inteiro: os outros foram salvos por acidente.
 *
 * O mesmo sorteio deixa mais tres coisas para tras, e nenhuma some ao morrer:
 *
 *   - `sm_drug @all`, cujo timer inclina o `roll` da camera. Ele se limpa
 *     sozinho quando o timer percebe que o jogador morreu -- mas quem estava
 *     MORTO na hora do sorteio nunca teve o timer parado direito.
 *   - `SetModelScale` 2 ou 0.7 no jogador, que sobrevive ao renascer e deixa a
 *     altura do olho errada.
 *   - um `env_screenoverlay` de 120 segundos, que em multiplayer aparece para
 *     todos ao mesmo tempo. O proprio mapa manda `Kill` no `trigger_multiple`
 *     que carregava o desligamento, 5 a 7 segundos depois de ligar.
 *
 * POR QUE O CONSERTO NAO E NESTE MAPA
 *
 * Nada disso e defeito de um mapa so: e o comportamento normal do `Fade` com
 * STAYOUT mais um plugin de diversao sem limpeza. Qualquer mapa com
 * `point_servercommand` faz igual, e o servidor tem varios. Entao o conserto
 * mora aqui, no lado do servidor, e vale para todos.
 *
 * O QUE ESTE PLUGIN FAZ
 *
 *   ao nascer      limpa a fila de fades, endireita o roll da camera e devolve
 *                  o tamanho do modelo ao normal.
 *   no round       limpa todo mundo e desliga overlay de tela que tenha ficado.
 *   !tela          o jogador se desentala sozinho, sem esperar round nem admin.
 *
 * O QUE ELE NAO FAZ, DE PROPOSITO
 *
 * Nao impede o mapa de aplicar o efeito. O BLIND MODE continua acontecendo e
 * continua atrapalhando quem esta vivo -- e a graca do mapa. O que ele garante
 * e que existe SAIDA: morrer, renascer, virar o round ou digitar !tela.
 *
 * Cegueira de flashbang usa outro caminho (`m_flFlashDuration`) e nao e tocada
 * aqui. Quem levou flash levou flash.
 */
public Plugin myinfo =
{
    name = "[LENDAS] Limpa Tela",
    author = "LENDAS / Codex",
    description = "Tira efeito de tela que ficou preso (blind, drug, escala, overlay).",
    version = PLUGIN_VERSION,
    url = ""
};

/* Flags da mensagem Fade, do enum do proprio jogo. */
#define FFADE_IN        0x0001
#define FFADE_OUT       0x0002
#define FFADE_MODULATE  0x0004
#define FFADE_STAYOUT   0x0008
#define FFADE_PURGE     0x0010

ConVar g_CvarAtivo;
ConVar g_CvarAviso;

UserMsg g_FadeMsg = INVALID_MESSAGE_ID;

public void OnPluginStart()
{
    CreateConVar("lendas_limpatela_version", PLUGIN_VERSION,
        "Versao do [LENDAS] Limpa Tela.", FCVAR_NOTIFY | FCVAR_DONTRECORD);

    g_CvarAtivo = CreateConVar("lendas_limpatela_ativo", "1",
        "1 = limpa efeito preso ao nascer e no round. 0 = nao mexe.",
        FCVAR_NONE, true, 0.0, true, 1.0);

    g_CvarAviso = CreateConVar("lendas_limpatela_aviso", "1",
        "Conta no chat que o !tela existe, uma vez por mapa, para quem entra.",
        FCVAR_NONE, true, 0.0, true, 1.0);

    AutoExecConfig(true, "lendas_limpatela", "sourcemod");

    g_FadeMsg = GetUserMessageId("Fade");
    if (g_FadeMsg == INVALID_MESSAGE_ID)
    {
        // Sem a mensagem Fade nao ha o que limpar, e seguir adiante so
        // esconderia o motivo de nada funcionar.
        SetFailState("Este jogo nao tem a mensagem de usuario \"Fade\".");
    }

    RegConsoleCmd("sm_tela", Comando_Tela, "Tira efeito de tela preso (cegueira, camera torta).");
    RegConsoleCmd("sm_limpartela", Comando_Tela, "Tira efeito de tela preso.");
    RegConsoleCmd("sm_unblind", Comando_Tela, "Tira efeito de tela preso.");

    HookEvent("player_spawn", Evento_Nasceu);
    HookEvent("round_start", Evento_RoundStart, EventHookMode_PostNoCopy);
}

/**
 * Manda a mensagem que apaga fade.
 *
 * `FFADE_PURGE` e a parte que importa: ela esvazia a FILA de fades do cliente,
 * inclusive um STAYOUT que ficaria para sempre. O `FFADE_IN` com cor
 * transparente e o que traz a tela de volta ao normal na hora.
 *
 * Os 1536 de duracao e espera sao os mesmos que o funcommands usa para
 * desfazer o proprio efeito -- nao ha motivo para inventar outro numero.
 */
void ApagarFade(int client)
{
    int destinos[1];
    destinos[0] = client;

    int cor[4] = { 0, 0, 0, 0 };

    Handle msg = StartMessageEx(g_FadeMsg, destinos, 1);
    if (msg == null)
    {
        return;
    }

    // O CS:S usa bitbuf; o protobuf e coisa de CS:GO em diante. Ainda assim a
    // pergunta e feita, porque errar isso corrompe a mensagem em vez de dar
    // erro.
    if (GetUserMessageType() == UM_Protobuf)
    {
        Protobuf pb = UserMessageToProtobuf(msg);
        pb.SetInt("duration", 1536);
        pb.SetInt("hold_time", 1536);
        pb.SetInt("flags", FFADE_IN | FFADE_PURGE);
        pb.SetColor("clr", cor);
    }
    else
    {
        BfWrite bf = UserMessageToBfWrite(msg);
        bf.WriteShort(1536);
        bf.WriteShort(1536);
        bf.WriteShort(FFADE_IN | FFADE_PURGE);
        bf.WriteByte(cor[0]);
        bf.WriteByte(cor[1]);
        bf.WriteByte(cor[2]);
        bf.WriteByte(cor[3]);
    }
    EndMessage();
}

/**
 * Endireita a camera.
 *
 * O `sm_drug` inclina o eixo Z do angulo de visao (o `roll`) uma vez por
 * segundo. Zerar so o roll preserva para onde a pessoa estava olhando: mexer
 * em pitch ou yaw seria girar o jogador contra a vontade dele.
 */
void EndireitarCamera(int client)
{
    if (!IsPlayerAlive(client))
    {
        return;
    }

    float angulos[3];
    GetClientEyeAngles(client, angulos);
    if (angulos[2] == 0.0)
    {
        return;
    }

    angulos[2] = 0.0;
    TeleportEntity(client, NULL_VECTOR, angulos, NULL_VECTOR);
}

/**
 * Devolve o tamanho normal ao modelo.
 *
 * `m_flModelScale` nem sempre existe: depende da versao do jogo e do SDK com
 * que o servidor foi compilado. Perguntar antes custa nada e evita um erro no
 * log a cada nascimento -- que e como um conserto vira o proximo problema.
 */
void TamanhoNormal(int client)
{
    if (HasEntProp(client, Prop_Send, "m_flModelScale"))
    {
        if (GetEntPropFloat(client, Prop_Send, "m_flModelScale") != 1.0)
        {
            SetEntPropFloat(client, Prop_Send, "m_flModelScale", 1.0);
        }
    }
}

void Limpar(int client)
{
    ApagarFade(client);
    EndireitarCamera(client);
    TamanhoNormal(client);
}

/**
 * Desliga overlay de tela que o mapa tenha deixado ligado.
 *
 * So no inicio do round, e nao a cada nascimento, por um motivo: o
 * `env_screenoverlay` e uma entidade unica e o efeito dela vale para TODOS ao
 * mesmo tempo. Desligar a cada nascimento faria o primeiro jogador que
 * renascesse cancelar o efeito do servidor inteiro -- o modo do mapa nunca
 * chegaria a acontecer. Virando o round, ele ja aconteceu.
 */
void DesligarOverlays()
{
    int ent = -1;
    while ((ent = FindEntityByClassname(ent, "env_screenoverlay")) != -1)
    {
        AcceptEntityInput(ent, "StopOverlays");
    }
}

public void OnClientPutInServer(int client)
{
    if (!g_CvarAtivo.BoolValue || !g_CvarAviso.BoolValue || IsFakeClient(client))
    {
        return;
    }
    CreateTimer(35.0, Timer_Contar, GetClientUserId(client));
}

/**
 * O aviso chega depois do aviso do !r, de proposito.
 *
 * O lendas_respawn fala aos 20 segundos. Duas dicas seguidas no mesmo instante
 * viram uma parede de texto que ninguem le.
 */
public Action Timer_Contar(Handle timer, any userid)
{
    int client = GetClientOfUserId(userid);
    if (client > 0 && IsClientInGame(client))
    {
        PrintToChat(client, "\x04[LENDAS]\x01 Tela escura ou torta por causa do mapa? Digite \x04!tela\x01.");
    }
    return Plugin_Stop;
}

public Action Comando_Tela(int client, int args)
{
    if (client == 0)
    {
        ReplyToCommand(client, "[LENDAS] O !tela e comando de jogador.");
        return Plugin_Handled;
    }

    Limpar(client);
    PrintToChat(client, "\x04[LENDAS]\x01 Tela limpa.");
    return Plugin_Handled;
}

public void Evento_Nasceu(Event evento, const char[] nome, bool naoTransmitir)
{
    if (!g_CvarAtivo.BoolValue)
    {
        return;
    }

    int client = GetClientOfUserId(evento.GetInt("userid"));
    if (client <= 0 || !IsClientInGame(client))
    {
        return;
    }

    // Um frame de espera. No instante do player_spawn o jogador ainda esta
    // trocando de estado, e mensagem mandada agora pode ser atropelada pelo
    // proprio jogo -- inclusive pelo fade que o CS:S manda ao nascer.
    RequestFrame(Frame_LimparApos, GetClientUserId(client));
}

public void Frame_LimparApos(any userid)
{
    int client = GetClientOfUserId(userid);
    if (client > 0 && IsClientInGame(client))
    {
        Limpar(client);
    }
}

public void Evento_RoundStart(Event evento, const char[] nome, bool naoTransmitir)
{
    if (!g_CvarAtivo.BoolValue)
    {
        return;
    }

    DesligarOverlays();

    for (int i = 1; i <= MaxClients; i++)
    {
        if (IsClientInGame(i) && !IsFakeClient(i))
        {
            Limpar(i);
        }
    }
}

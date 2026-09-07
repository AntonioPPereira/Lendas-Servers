#pragma semicolon 1
#pragma newdecls required

#include <sourcemod>
#include <sdktools>
#include <sdkhooks>

#define PLUGIN_VERSION "2.0.0"

// Grupos de colisão do Source.
#define COLLISION_GROUP_PLAYER          5
#define COLLISION_GROUP_PLAYER_MOVEMENT 8
/** Atravessa jogador, mas ainda ativa gatilho de mapa. */
#define COLLISION_GROUP_DEBRIS_TRIGGER  2

/**
 * Atravessar outros jogadores — agora sem a sensação de engasgo.
 *
 * O QUE ESTAVA ERRADO NA 1.0.0
 *
 * Ela usava só o `SDKHook_ShouldCollide`, que responde à pergunta no
 * SERVIDOR. Funcionava: dava para atravessar. Mas o CLIENTE não sabia de
 * nada — ele continuava prevendo a colisão, empurrava o jogador para trás, o
 * servidor discordava e devolvia. O resultado era o travadinho ao passar
 * dentro do outro.
 *
 * O que o cliente enxerga é o GRUPO DE COLISÃO, que é sincronizado com ele.
 * Mudando o grupo, os dois lados passam a concordar antes do movimento
 * acontecer, e o engasgo some.
 *
 * O CUIDADO QUE ISSO EXIGE, E POR QUE HÁ DOIS CAMINHOS
 *
 * Escrever direto no `m_CollisionGroup` é a receita conhecida e causa um bug
 * de física documentado no CS:S — armas caindo pelo mapa, props sumindo —
 * porque pula a limpeza interna (`CollisionRulesChanged`) que a engine faz
 * quando o grupo muda de verdade.
 *
 * O SourceMod 1.11 ganhou a nativa `SetEntityCollisionGroup`, que chama a
 * função da própria engine e faz a limpeza. É o caminho certo. Só que ela
 * depende de uma assinatura no gamedata, e **nesta instalação essa assinatura
 * não existe para jogo nenhum** — procurei em todos os arquivos.
 *
 * Então o plugin tenta a nativa e, se ela não estiver disponível, usa a
 * escrita direta. E DIZ NO LOG qual dos dois está usando. Assim a escolha
 * deixa de ser suposição minha: o servidor responde.
 *
 * O gancho do servidor continua ligado junto com o grupo. Não é redundância
 * inútil: o grupo faz cliente e servidor concordarem, e o gancho garante que
 * o servidor não deixe passar nenhum caso que o grupo não cubra.
 *
 * POR QUE O GRUPO É "DEBRIS_TRIGGER" E NÃO "DEBRIS"
 *
 * Os dois atravessam jogador. A diferença é que o DEBRIS puro também ignora
 * os gatilhos do mapa — e um mapa de percurso é feito de gatilho. Com ele, o
 * jogador atravessaria o colega e também o fim da fase.
 */
public Plugin myinfo =
{
    name = "[LENDAS] Sem Colisao",
    author = "LENDAS / Codex",
    description = "Permite atravessar outros jogadores, com o cliente sabendo disso.",
    version = PLUGIN_VERSION,
    url = ""
};

ConVar g_CvarAtivo;
ConVar g_CvarNativo;

/** A nativa correta existe e está utilizável neste servidor? */
bool g_bTemNativo;

public void OnPluginStart()
{
    CreateConVar("lendas_noblock_version", PLUGIN_VERSION,
        "Versão do [LENDAS] Sem Colisao.", FCVAR_NOTIFY | FCVAR_DONTRECORD);

    g_CvarAtivo = CreateConVar("lendas_noblock_ativo", "1",
        "1 = jogadores se atravessam. 0 = colisão normal do jogo.",
        FCVAR_NONE, true, 0.0, true, 1.0);

    g_CvarNativo = CreateConVar("lendas_noblock_nativo", "1",
        "1 = usa SetEntityCollisionGroup quando existir (caminho certo). 0 = força a escrita direta. Só mexa se o log acusar erro.",
        FCVAR_NONE, true, 0.0, true, 1.0);

    AutoExecConfig(true, "lendas_noblock", "sourcemod");

    g_bTemNativo = (GetFeatureStatus(FeatureType_Native, "SetEntityCollisionGroup")
                    == FeatureStatus_Available);

    LogMessage("caminho para mudar o grupo de colisão: %s",
        g_bTemNativo
            ? "SetEntityCollisionGroup (nativa da engine, com limpeza interna)"
            : "escrita direta em m_CollisionGroup (a nativa não existe aqui)");

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
    SDKHook(client, SDKHook_ShouldCollide, Gancho_DeveColidir);
    SDKHook(client, SDKHook_SpawnPost, Gancho_Nasceu);
}

public void Gancho_Nasceu(int client)
{
    // Um instante depois: no próprio spawn o jogo ainda está montando o
    // jogador, e o grupo escrito agora seria sobrescrito em seguida.
    CreateTimer(0.2, Timer_Aplicar, GetClientUserId(client));
}

public Action Timer_Aplicar(Handle timer, any userid)
{
    int client = GetClientOfUserId(userid);
    if (client <= 0 || !IsClientInGame(client) || !IsPlayerAlive(client))
    {
        return Plugin_Stop;
    }

    DefinirGrupo(client, g_CvarAtivo.BoolValue
        ? COLLISION_GROUP_DEBRIS_TRIGGER
        : COLLISION_GROUP_PLAYER);
    return Plugin_Stop;
}

/**
 * Muda o grupo pelo melhor caminho disponível.
 *
 * A nativa faz a engine cuidar da limpeza interna. A escrita direta não faz,
 * e é a origem do bug de física conhecido — por isso ela é o segundo caminho,
 * não o primeiro.
 */
void DefinirGrupo(int client, int grupo)
{
    if (GetEntProp(client, Prop_Data, "m_CollisionGroup") == grupo)
    {
        return;   // já está assim; mexer à toa é o que causa o bug
    }

    if (g_bTemNativo && g_CvarNativo.BoolValue)
    {
        SetEntityCollisionGroup(client, grupo);
        return;
    }

    SetEntProp(client, Prop_Data, "m_CollisionGroup", grupo);
    // Marca o estado como alterado para o cliente receber o valor novo. Sem
    // isto a mudança poderia ficar só no servidor — e o engasgo continuaria,
    // que é justamente o que esta versão veio consertar.
    ChangeEdictState(client, FindDataMapInfo(client, "m_CollisionGroup"));
}

/**
 * A rede de segurança do lado do servidor.
 *
 * `entity` é o obstáculo em potencial; `collisiongroup` é o grupo de quem se
 * move. Devolver `false` faz o trace ignorar este jogador. Tudo o que não for
 * outro jogador passando cai no `original`, e por isso tiro, granada e porta
 * continuam funcionando.
 */
public bool Gancho_DeveColidir(int entity, int collisiongroup, int contentsmask, bool original)
{
    if (!g_CvarAtivo.BoolValue)
    {
        return original;
    }

    if (collisiongroup != COLLISION_GROUP_PLAYER
        && collisiongroup != COLLISION_GROUP_PLAYER_MOVEMENT)
    {
        return original;
    }

    return false;
}

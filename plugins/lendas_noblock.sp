#pragma semicolon 1
#pragma newdecls required

#include <sourcemod>
#include <sdktools>
#include <sdkhooks>

#define PLUGIN_VERSION "3.0.0"

// Grupos de colisão do Source, com os números do enum Collision_Group_t
// (src/public/const.h do SDK). Os números importam: a regra da engine compara
// os dois grupos DEPOIS de ordenar do menor para o maior.
#define COLLISION_GROUP_NONE            0
#define COLLISION_GROUP_DEBRIS_TRIGGER  2   // atravessa tudo menos o grupo NONE
#define COLLISION_GROUP_INTERACTIVE     4   // onde o prop_physics costuma cair
#define COLLISION_GROUP_PLAYER          5
#define COLLISION_GROUP_PLAYER_MOVEMENT 8
#define COLLISION_GROUP_PUSHAWAY       17   // prop de física acordado

/**
 * Atravessar outros jogadores, sem deixar de subir nos props.
 *
 * O QUE A 2.0.0 QUEBROU, E POR QUE DEMOROU A APARECER
 *
 * Ela põe todo jogador no grupo `DEBRIS_TRIGGER`, que é a receita conhecida
 * de noblock no CS:S e resolveu mesmo a sensação de engasgo. O preço só
 * aparece em mapa de veículo, e está escrito no SDK da Valve, em
 * `CGameRules::ShouldCollide`:
 *
 *     if ( collisionGroup0 == COLLISION_GROUP_DEBRIS ||
 *          collisionGroup0 == COLLISION_GROUP_DEBRIS_TRIGGER )
 *     {
 *         // put exceptions here, right now this will only collide with
 *         // COLLISION_GROUP_NONE
 *         return false;
 *     }
 *
 * **`DEBRIS_TRIGGER` colide SÓ com o grupo `NONE`.** O mundo e os brushes
 * comuns são `NONE`, e é por isso que ninguém cai pelo chão e nada disso
 * apareceu antes. Mas:
 *
 *   - `prop_physics` acaba em `COLLISION_GROUP_INTERACTIVE` (4), pelo arquivo
 *     de dados do modelo;
 *   - `func_physbox_multiplayer` entra em `COLLISION_GROUP_PUSHAWAY` (17) no
 *     `Activate()`, sempre;
 *   - e com `sv_turbophysics`, o `prop_physics` acordado também vira
 *     `PUSHAWAY`.
 *
 * Nenhum desses é `NONE`. Então o jogador ATRAVESSA os três — e os "veículos"
 * dos mapas de minigame são exatamente isso. Não há `prop_vehicle` nenhum nos
 * mapas instalados: o kart do `mg_crazykart`, o barco do `mg_boatrace` (278
 * entidades de física) e o tanque do `mg_tankbase` são prop e physbox.
 *
 * Repare no detalhe cruel: parado, o prop dorme e fica em `NONE`, e dá para
 * subir nele. Ele acorda ao se mexer, vira `PUSHAWAY`, e o jogador cai fora
 * justamente quando o veículo começa a andar.
 *
 * O CONSERTO
 *
 * Não existe grupo que atravesse jogador e colida com prop: é uma escolha da
 * engine, não uma configuração. Então o grupo passa a ser decidido pela
 * situação, e não uma vez só:
 *
 *   em cima (ou logo acima) de algo que não é do grupo NONE  ->  PLAYER
 *   em qualquer outro lugar                                  ->  DEBRIS_TRIGGER
 *
 * Ou seja: o noblock vale no mapa inteiro, e some no instante em que o
 * jogador está sobre um prop — que é o único momento em que ele atrapalha.
 * Em cima do veículo os jogadores voltam a se esbarrar, o que é o certo: são
 * dois corpos dividindo um kart.
 *
 * O teste é um traço curto para baixo, com o mesmo volume do jogador,
 * ignorando os outros jogadores. Ele resolve o problema do ovo e da galinha —
 * olhar o `m_hGroundEntity` não serviria, porque enquanto o jogador atravessa
 * o prop ele nunca chega a ter aquele chão.
 *
 * A NATIVA EXISTE AQUI, E ISSO MUDOU DESDE A 2.0.0
 *
 * A 2.0.0 dizia no comentário que `SetEntityCollisionGroup` não existia nesta
 * instalação. Existe: o log do servidor a registra em uso desde o dia 7. Isso
 * importa porque agora o grupo troca com frequência, e é a nativa que faz a
 * limpeza interna da engine (`CollisionRulesChanged`) — sem ela, a escrita
 * direta repetida é a origem do bug de física de arma caindo pelo mapa.
 */
public Plugin myinfo =
{
    name = "[LENDAS] Sem Colisao",
    author = "LENDAS / Codex",
    description = "Atravessa outros jogadores, mas fica solido em cima de prop e veiculo.",
    version = PLUGIN_VERSION,
    url = ""
};

ConVar g_CvarAtivo;
ConVar g_CvarNativo;
ConVar g_CvarProps;
ConVar g_CvarAlcance;
ConVar g_CvarIntervalo;

/** A nativa correta existe e está utilizável neste servidor? */
bool g_bTemNativo;

Handle g_hRelogio;

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

    g_CvarProps = CreateConVar("lendas_noblock_props", "1",
        "1 = fica sólido em cima de prop e veículo, para dar para andar neles. 0 = atravessa tudo, como na 2.0.0.",
        FCVAR_NONE, true, 0.0, true, 1.0);

    // 24 unidades cobre o degrau que o jogador sobe sozinho. Menos que isso e
    // ele volta a cair do veículo em cada solavanco; muito mais e ele fica
    // sólido só de passar por cima de um caixote no chão.
    g_CvarAlcance = CreateConVar("lendas_noblock_alcance", "24.0",
        "A que distância abaixo dos pés um prop já conta como chão, em unidades do jogo.",
        FCVAR_NONE, true, 4.0, true, 128.0);

    g_CvarIntervalo = CreateConVar("lendas_noblock_intervalo", "0.1",
        "De quanto em quanto tempo o chão de cada jogador é conferido, em segundos.",
        FCVAR_NONE, true, 0.05, true, 1.0);

    AutoExecConfig(true, "lendas_noblock", "sourcemod");

    g_bTemNativo = (GetFeatureStatus(FeatureType_Native, "SetEntityCollisionGroup")
                    == FeatureStatus_Available);

    LogMessage("caminho para mudar o grupo de colisão: %s",
        g_bTemNativo
            ? "SetEntityCollisionGroup (nativa da engine, com limpeza interna)"
            : "escrita direta em m_CollisionGroup (a nativa não existe aqui)");

    g_CvarIntervalo.AddChangeHook(AoTrocarIntervalo);
    ReiniciarRelogio();

    for (int i = 1; i <= MaxClients; i++)
    {
        if (IsClientInGame(i))
        {
            OnClientPutInServer(i);
        }
    }
}

public void AoTrocarIntervalo(ConVar cvar, const char[] antes, const char[] agora)
{
    ReiniciarRelogio();
}

void ReiniciarRelogio()
{
    delete g_hRelogio;
    g_hRelogio = CreateTimer(g_CvarIntervalo.FloatValue, Timer_Conferir,
        _, TIMER_REPEAT | TIMER_FLAG_NO_MAPCHANGE);
}

public void OnMapStart()
{
    ReiniciarRelogio();
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
    if (client > 0 && IsClientInGame(client) && IsPlayerAlive(client))
    {
        Ajustar(client);
    }
    return Plugin_Stop;
}

public Action Timer_Conferir(Handle timer)
{
    for (int i = 1; i <= MaxClients; i++)
    {
        if (IsClientInGame(i) && IsPlayerAlive(i) && !IsFakeClient(i))
        {
            Ajustar(i);
        }
    }
    return Plugin_Continue;
}

/**
 * Decide o grupo deste jogador agora.
 */
void Ajustar(int client)
{
    if (!g_CvarAtivo.BoolValue)
    {
        DefinirGrupo(client, COLLISION_GROUP_PLAYER);
        return;
    }

    if (g_CvarProps.BoolValue && SobreAlgoSolido(client))
    {
        DefinirGrupo(client, COLLISION_GROUP_PLAYER);
        return;
    }

    DefinirGrupo(client, COLLISION_GROUP_DEBRIS_TRIGGER);
}

/**
 * Tem, logo abaixo dos pés, algo que o DEBRIS_TRIGGER não conseguiria pisar?
 *
 * Só interessa o que NÃO é do grupo `NONE`: com o grupo `NONE` o jogador já
 * colide normalmente mesmo atravessando os outros, e mudar o grupo ali seria
 * ligar a colisão entre jogadores à toa — em cima de um trem, por exemplo,
 * que é brush e portanto `NONE`.
 */
bool SobreAlgoSolido(int client)
{
    float origem[3], destino[3], minimo[3], maximo[3];
    GetClientAbsOrigin(client, origem);
    GetClientMins(client, minimo);
    GetClientMaxs(client, maximo);

    destino = origem;
    destino[2] -= g_CvarAlcance.FloatValue;

    // O volume do jogador, e não um raio: um raio saindo do meio dos pés
    // erraria o kart em que ele está pisando só com a beirada.
    TR_TraceHullFilter(origem, destino, minimo, maximo, MASK_PLAYERSOLID,
        Filtro_SemJogadores, client);

    if (!TR_DidHit())
    {
        return false;
    }

    int ent = TR_GetEntityIndex();
    if (ent <= 0)
    {
        return false;   // o mundo; o grupo NONE já colide
    }

    if (!HasEntProp(ent, Prop_Data, "m_CollisionGroup"))
    {
        return false;
    }

    return GetEntProp(ent, Prop_Data, "m_CollisionGroup") != COLLISION_GROUP_NONE;
}

/**
 * Ignora o próprio jogador e todos os outros no traço.
 *
 * Sem isto, um colega parado embaixo contaria como chão sólido e o jogador
 * viraria sólido no ar — exatamente o contrário do que este plugin existe
 * para fazer.
 */
public bool Filtro_SemJogadores(int entity, int contentsMask, any data)
{
    // Só os jogadores saem. A entidade 0 é o mundo e TEM de continuar no
    // traço: sem ela o raio atravessaria o chão e acharia um prop no andar de
    // baixo, deixando o jogador sólido no meio do nada.
    return !(entity >= 1 && entity <= MaxClients);
}

/**
 * Muda o grupo pelo melhor caminho disponível.
 *
 * A nativa faz a engine cuidar da limpeza interna. A escrita direta não faz,
 * e é a origem do bug de física conhecido — por isso ela é o segundo caminho,
 * não o primeiro. Isso pesa mais nesta versão do que na anterior: aqui o
 * grupo troca toda vez que alguém sobe ou desce de um prop.
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
    ChangeEdictState(client, FindDataMapInfo(client, "m_CollisionGroup"));
}

/**
 * A rede de segurança do lado do servidor.
 *
 * `entity` é o obstáculo em potencial; `collisiongroup` é o grupo de quem se
 * move. Devolver `false` faz o trace ignorar este jogador.
 *
 * MUDOU NA 3.0.0: quando este jogador está sólido em cima de um prop, o
 * gancho tem de devolver o comportamento normal. Senão o servidor continuaria
 * atravessando ele por baixo do pano, e o cliente — que enxerga o grupo
 * PLAYER — discordaria. Seria o engasgo de volta, e no pior lugar.
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

    if (GetEntProp(entity, Prop_Data, "m_CollisionGroup") == COLLISION_GROUP_PLAYER)
    {
        return original;
    }

    return false;
}

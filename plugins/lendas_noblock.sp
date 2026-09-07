#pragma semicolon 1
#pragma newdecls required

#include <sourcemod>
#include <sdkhooks>

#define PLUGIN_VERSION "1.0.0"

// Grupos de colisão do Source. Só estes dois interessam aqui: são os que o
// jogo usa quando um jogador se move e pergunta "tem alguém no caminho?".
#define COLLISION_GROUP_PLAYER          5
#define COLLISION_GROUP_PLAYER_MOVEMENT 8

/**
 * Tira a colisão entre jogadores — dá para atravessar o colega.
 *
 * POR QUE NÃO PELO CAMINHO ÓBVIO
 *
 * A receita que se acha em todo lugar é escrever no `m_CollisionGroup` do
 * jogador. Ela funciona e **causa um bug conhecido de física no CS:S**: armas
 * caindo pelo mapa, props sumindo. Um servidor movimentado que fez isso
 * mediu o problema acontecendo cerca de 2,6 vezes por dia.
 *
 * A causa é que escrever a variável direto pula a limpeza que a engine faz
 * quando o grupo muda de verdade (`CollisionRulesChanged`), e o filtro de
 * colisão fica com estado velho sobre os outros objetos.
 *
 * COMO ESTE FAZ
 *
 * Não muda o grupo de ninguém. Ele responde à PERGUNTA que a engine já faz
 * antes de cada movimento: "este jogador deve colidir com quem está
 * consultando?". Quando quem consulta é o movimento de outro jogador, a
 * resposta passa a ser não. Nenhum estado é alterado, então não há o que
 * ficar desatualizado — e desligar o plugin devolve tudo ao normal na hora,
 * sem reiniciar nada.
 *
 * O que continua funcionando de propósito: TIRO. A bala não consulta com
 * grupo de jogador, então ela acerta normalmente. Só o corpo deixa de barrar
 * o corpo.
 *
 * POR QUE NÃO EXISTE "ATRAVESSA SÓ O ADVERSÁRIO"
 *
 * Seria a opção natural, para não perder o subir-no-colega que vários mapas
 * de minigame usam. Não dá por aqui: a engine informa QUEM é o obstáculo,
 * mas não quem está tentando passar — sem os dois lados não há como comparar
 * time. Fazer isso exigiria voltar a mexer no grupo de colisão, que é
 * justamente o caminho que este plugin existe para evitar.
 *
 * Então a escolha é honesta e binária: com colisão, ou sem. Se um mapa
 * precisar de boost, o caminho é `lendas_noblock_ativo 0` naquele mapa.
 */
public Plugin myinfo =
{
    name = "[LENDAS] Sem Colisao",
    author = "LENDAS / Codex",
    description = "Permite atravessar outros jogadores, sem mexer no grupo de colisão.",
    version = PLUGIN_VERSION,
    url = ""
};

ConVar g_CvarAtivo;

public void OnPluginStart()
{
    CreateConVar("lendas_noblock_version", PLUGIN_VERSION, "Versão do [LENDAS] Sem Colisao.",
        FCVAR_NOTIFY | FCVAR_DONTRECORD);

    g_CvarAtivo = CreateConVar("lendas_noblock_ativo", "1",
        "1 = jogadores se atravessam. 0 = colisão normal do jogo (para mapa que precisa de boost).",
        FCVAR_NONE, true, 0.0, true, 1.0);

    AutoExecConfig(true, "lendas_noblock", "sourcemod");

    // Quem já está no servidor quando o plugin carrega também precisa do
    // gancho — senão só quem entrar depois atravessa, e o resultado fica
    // inexplicável para quem está jogando.
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
}

/**
 * A engine pergunta, antes de mover alguém, se este jogador atrapalha.
 *
 * `entity` é o jogador que tem o gancho — o obstáculo em potencial.
 * `collisiongroup` é o grupo de QUEM está se movendo.
 *
 * Devolver `false` faz o trace ignorar este jogador. Devolver o `original`
 * em todo o resto é o que mantém tiro, granada, porta e física do mapa
 * funcionando como sempre: só a pergunta "outro jogador está tentando passar
 * por aqui?" tem a resposta trocada.
 */
public bool Gancho_DeveColidir(int entity, int collisiongroup, int contentsmask, bool original)
{
    if (!g_CvarAtivo.BoolValue)
    {
        return original;
    }

    // Só interessa quando quem consulta é o corpo de outro jogador. Bala e
    // granada consultam com outro grupo e caem no `original`.
    if (collisiongroup != COLLISION_GROUP_PLAYER
        && collisiongroup != COLLISION_GROUP_PLAYER_MOVEMENT)
    {
        return original;
    }

    return false;
}

// Diagnóstico de conexão SFTP — roda fora da API, só imprime o que aconteceu
// na negociação do protocolo. Nunca loga usuário/senha, só o handshake.
import "dotenv/config";
import SftpClient from "ssh2-sftp-client";

const host = process.env.SFTP_HOST;
const port = Number(process.env.SFTP_PORT ?? 22);
const username = process.env.SFTP_USERNAME;
const password = process.env.SFTP_PASSWORD;

if (!host || !username || !password) {
  console.error("Faltando SFTP_HOST/SFTP_USERNAME/SFTP_PASSWORD no .env");
  process.exit(1);
}

console.log(`Conectando em ${host}:${port} como "${username}" (senha oculta)...\n`);

const client = new SftpClient();

client
  .connect({
    host,
    port,
    username,
    password,
    readyTimeout: 15000,
    debug: (msg) => console.log("[ssh2]", msg),
  })
  .then(async () => {
    console.log("\n✅ CONECTOU. Listando raiz...");
    const list = await client.list("/");
    console.log(list.map((e) => `${e.type} ${e.name}`).join("\n"));
    await client.end();
  })
  .catch((err) => {
    console.error("\n❌ FALHOU:", err.message);
    console.error("code:", err.code);
    process.exit(1);
  });

// One-off: corrige lendas_api_url e lendas_api_token no cfg do lendas_live via SFTP.
// READ-MODIFY-WRITE com backup local do original. NUNCA imprime o token.
// Env: SFTP_HOST/PORT/USERNAME/PASSWORD, REMOTE_FILE, NEW_URL, NEW_TOKEN
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import SftpClient from "ssh2-sftp-client";

const cfg = {
  host: process.env.SFTP_HOST,
  port: Number(process.env.SFTP_PORT ?? 22),
  username: process.env.SFTP_USERNAME,
  password: process.env.SFTP_PASSWORD,
  readyTimeout: 20000,
};
const FILE = process.env.REMOTE_FILE;
const NEW_URL = process.env.NEW_URL;
const NEW_TOKEN = process.env.NEW_TOKEN;

if (!FILE || !NEW_URL || !NEW_TOKEN) {
  console.error("Faltando REMOTE_FILE/NEW_URL/NEW_TOKEN no ambiente.");
  process.exit(1);
}

const client = new SftpClient();
await client.connect(cfg);
try {
  const original = (await client.get(FILE)).toString("utf8");

  // backup local do original antes de qualquer escrita
  const backupDir = "_backups/live-cfg";
  fs.mkdirSync(backupDir, { recursive: true });
  const safe = FILE.replace(/[^a-zA-Z0-9]+/g, "_");
  const backupPath = path.join(backupDir, `${safe}.${Date.now()}.bak`);
  fs.writeFileSync(backupPath, original, "utf8");

  const oldUrl = (original.match(/lendas_api_url\s+"([^"]*)"/) || [])[1] ?? "(ausente)";

  let text = original;
  text = /lendas_api_url\s+"[^"]*"/.test(text)
    ? text.replace(/lendas_api_url\s+"[^"]*"/, `lendas_api_url "${NEW_URL}"`)
    : text + `\nlendas_api_url "${NEW_URL}"\n`;
  text = /lendas_api_token\s+"[^"]*"/.test(text)
    ? text.replace(/lendas_api_token\s+"[^"]*"/, `lendas_api_token "${NEW_TOKEN}"`)
    : text + `\nlendas_api_token "${NEW_TOKEN}"\n`;

  await client.put(Buffer.from(text, "utf8"), FILE);

  console.log(`OK  ${FILE}`);
  console.log(`  url:   ${oldUrl}  ->  ${NEW_URL}`);
  console.log(`  token: atualizado (${NEW_TOKEN.length} chars, valor oculto)`);
  console.log(`  backup: server/${backupPath}`);
} catch (e) {
  console.error("ERRO:", e.message);
  process.exitCode = 1;
} finally {
  try { await client.end(); } catch {}
}

// One-off: seta um cvar (CVAR_NAME) num cfg remoto via SFTP, read-modify-write
// com backup local. NUNCA imprime o valor. Env: SFTP_*, REMOTE_FILE, CVAR_NAME, CVAR_VALUE
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
const CVAR = process.env.CVAR_NAME;
const VALUE = process.env.CVAR_VALUE;

if (!FILE || !CVAR || !VALUE) {
  console.error("Faltando REMOTE_FILE/CVAR_NAME/CVAR_VALUE no ambiente.");
  process.exit(1);
}

const client = new SftpClient();
await client.connect(cfg);
try {
  let original;
  try {
    original = (await client.get(FILE)).toString("utf8");
  } catch {
    console.log(`PULADO (nao existe): ${FILE}`);
    process.exit(0);
  }

  const backupDir = "_backups/cvar-cfg";
  fs.mkdirSync(backupDir, { recursive: true });
  const safe = FILE.replace(/[^a-zA-Z0-9]+/g, "_");
  fs.writeFileSync(path.join(backupDir, `${safe}.${Date.now()}.bak`), original, "utf8");

  const re = new RegExp(`${CVAR}\\s+"[^"]*"`);
  const text = re.test(original)
    ? original.replace(re, `${CVAR} "${VALUE}"`)
    : original + `\n${CVAR} "${VALUE}"\n`;

  await client.put(Buffer.from(text, "utf8"), FILE);
  console.log(`OK  ${FILE}  (${CVAR} atualizado, ${VALUE.length} chars, valor oculto)`);
} catch (e) {
  console.error("ERRO:", e.message);
  process.exitCode = 1;
} finally {
  try { await client.end(); } catch {}
}

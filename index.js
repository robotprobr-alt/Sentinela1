const { Client, GatewayIntentBits } = require("discord.js");
const express = require("express");

console.log("Iniciando aplicação...");

// ===== WEB SERVER (Render exige porta dinâmica) =====
const app = express();

app.get("/", (req, res) => {
  res.send("Vaqueiro Bot online 🤠");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Web service rodando na porta ${PORT}`);
});

// ===== DEBUG TOKEN =====
console.log("TOKEN existe?", !!process.env.TOKEN);

if (!process.env.TOKEN) {
  console.log("ERRO: TOKEN não encontrado nas variáveis de ambiente.");
}

// ===== DISCORD CLIENT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.on("debug", (info) => {
  console.log("DEBUG:", info);
});

client.on("error", (err) => {
  console.error("ERRO NO CLIENT:", err);
});

client.once("ready", () => {
  console.log("✅ Logado como:", client.user.tag);
});

console.log("Tentando login...");

client.login(process.env.TOKEN)
  .then(() => console.log("Login enviado para Discord..."))
  .catch((err) => console.error("Falha no login:", err));client.on("error", (err) => {
  console.error("ERRO NO CLIENT:", err);
});

client.once("ready", () => {
  console.log("Logado como:", client.user.tag);
});

console.log("Tentando login...");
client.login(process.env.TOKEN)
  .then(() => console.log("Login enviado para Discord..."))
  .catch((err) => console.error("Falha no login:", err));

const { Client, GatewayIntentBits } = require("discord.js");
const express = require("express");

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

console.log("Iniciando aplicação...");

// ===== WEB SERVER =====
const app = express();

app.get("/", (req, res) => {
  res.send("Bot online 🤠");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Web service rodando na porta ${PORT}`);
});

console.log("TOKEN existe?", !!process.env.TOKEN);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("ready", () => {
  console.log("✅ LOGADO COMO:", client.user.tag);
});

console.log("Tentando login...");

client.login(process.env.TOKEN)
  .then(() => console.log("Login enviado"))
  .catch((err) => {
    console.error("ERRO NO LOGIN:", err);
  });

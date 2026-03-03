const { Client, GatewayIntentBits } = require("discord.js");
const express = require("express");

// ===== WEB SERVER (necessário pro Render não desligar) =====
const app = express();

app.get("/", (req, res) => {
  res.send("Vaqueiro Bot está online 🤠");
});

app.listen(3000, () => {
  console.log("Web server rodando na porta 3000");
});

// ===== DISCORD BOT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("ready", () => {
  console.log(`Logado como ${client.user.tag}`);
});

client.on("messageCreate", (message) => {
  if (message.author.bot) return;

  if (message.content === "!ping") {
    message.reply("Pong 🤠");
  }
});

client.login(process.env.TOKEN);

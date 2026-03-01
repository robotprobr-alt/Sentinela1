const {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ════════════════════════════════════════
// CHAVES DIRETAS (COLE SUAS CHAVES AQUI)
// ════════════════════════════════════════
const GROQ_API_KEY = "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";
const DISCORD_TOKEN = "MTM1MzIxMDA3MzgzMjM1Nzk5Mg.GX7wIE.ZHf5t7yv7gB-moALWcu3scVzPD4BJEkeFzJFjM";
const CLIENT_ID = "1353210073832357992";

console.log("🔵 Bot iniciando com chaves diretas...");
console.log("🔵 GROQ_API_KEY:", GROQ_API_KEY ? "✅ Definido" : "❌ Undefined");
console.log("🔵 DISCORD_TOKEN:", DISCORD_TOKEN ? "✅ Definido" : "❌ Undefined");
console.log("🔵 CLIENT_ID:", CLIENT_ID ? "✅ Definido" : "❌ Undefined");

const activeChannels = new Set();
const histories = new Map();
const serverLanguage = new Map();

function buildPrompt(lang) {
  const langInstruction = lang && lang !== "português"
    ? `You must ALWAYS respond in ${lang}, no matter what language the user writes in.`
    : `Responde sempre em português brasileiro.`;

  const ptExtra = lang === "português" || !lang ? `
Você é brasileiro e fala igual brasileiro: "kkkkk", "tá", "né", "pq", "vc", "mano", "cara".
` : "";

  return `
Você é o Sentinela. Inteligente, direto, um pouco irônico.
Fala naturalmente. Nunca começa com "Claro!", "Com certeza!".
Quando explicar algo longo, divide em mensagens com [SPLIT]. Máximo 3 linhas por parte.
Memória: você lembra da conversa.
Código: triple backtick.
${ptExtra}
${langInstruction}
`;
}

const commands = [
  new SlashCommandBuilder()
    .setName("talkon")
    .setDescription("Ativa Sentinela neste canal"),
  new SlashCommandBuilder()
    .setName("talkoff")
    .setDescription("Desativa Sentinela neste canal"),
  new SlashCommandBuilder()
    .setName("idioma")
    .setDescription("Define idioma")
    .addStringOption(option =>
      option.setName("lingua").setDescription("Idioma").setRequired(true)
        .addChoices(
          { name: "🇧🇷 Português", value: "português" },
          { name: "🇺🇸 English", value: "english" },
          { name: "🇪🇸 Español", value: "español" },
        )
    ),
].map(c => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
  try {
    console.log("📝 Registrando comandos...");
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log("✅ Comandos registrados!");
  } catch (err) {
    console.error("❌ Erro ao registrar comandos:", err);
  }
}

async function askSentinela(channelId, guildId, userMsg, username) {
  if (!histories.has(channelId)) histories.set(channelId, []);
  const history = histories.get(channelId);

  history.push({ role: "user", content: `${username}: ${userMsg}` });
  if (history.length > 10) history.splice(0, history.length - 10);

  const lang = serverLanguage.get(guildId) || "português";

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: buildPrompt(lang) },
        ...history,
      ],
      max_tokens: 700,
      temperature: 0.9,
      top_p: 0.95,
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);

  const reply = data.choices[0].message.content;
  history.push({ role: "assistant", content: reply });

  return reply;
}

function humanDelay(text) {
  const delay = Math.min(Math.max(text.length * 35, 700), 3500);
  return new Promise(resolve => setTimeout(resolve, delay));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function splitMessage(text, maxLen = 1990) {
  if (text.length <= maxLen) return [text];
  const parts = [];
  let current = "";
  for (const line of text.split("\n")) {
    if ((current + "\n" + line).length > maxLen) {
      parts.push(current);
      current = line;
    } else {
      current += (current ? "\n" : "") + line;
    }
  }
  if (current) parts.push(current);
  return parts;
}

// Limpa memória a cada 30 minutos
setInterval(() => {
  for (const [channelId] of histories.entries()) {
    if (!activeChannels.has(channelId)) {
      histories.delete(channelId);
    }
  }
  console.log("🧹 Memória limpa");
}, 1800000);

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Sentinela online: ${c.user.tag}`);
  await registerCommands();
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, channelId, guildId } = interaction;

  if (commandName === "talkon") {
    activeChannels.add(channelId);
    await interaction.reply({ content: "tô de olho. pode falar.", ephemeral: false });
  }
  else if (commandName === "talkoff") {
    activeChannels.delete(channelId);
    histories.delete(channelId);
    await interaction.reply({ content: "saindo.", ephemeral: false });
  }
  else if (commandName === "idioma") {
    const lingua = interaction.options.getString("lingua");
    serverLanguage.set(guildId, lingua);
    const msgs = {
      "português": "português ativado 🤙",
      "english": "English enabled.",
      "español": "Español activado.",
    };
    await interaction.reply({ content: msgs[lingua], ephemeral: false });
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const mentioned = message.mentions.has(client.user);
  const channelActive = activeChannels.has(message.channel.id);

  if (!mentioned && !channelActive) return;

  const userText = message.content.replace(/<@!?[0-9]+>/g, "").trim();

  if (!userText) {
    if (mentioned) await message.reply("oi");
    return;
  }

  await message.channel.sendTyping();

  try {
    const reply = await askSentinela(
      message.channel.id,
      message.guild?.id,
      userText,
      message.author.username
    );

    const parts = reply.split("[SPLIT]").map(p => p.trim()).filter(p => p);

    const firstParts = splitMessage(parts[0]);
    await message.reply(firstParts[0]);
    for (let i = 1; i < firstParts.length; i++) {
      await message.channel.send(firstParts[i]);
    }

    for (let i = 1; i < parts.length; i++) {
      await humanDelay(parts[i]);
      await message.channel.sendTyping();
      await sleep(400);
      const subParts = splitMessage(parts[i]);
      for (const sub of subParts) {
        await message.channel.send(sub);
      }
    }

  } catch (err) {
    console.error("❌ Erro:", err.message);
    await message.reply("deu ruim, tenta de novo");
  }
});

client.login(DISCORD_TOKEN);

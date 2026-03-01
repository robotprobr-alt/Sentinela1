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
    GatewayIntentBits.DirectMessages,
  ],
});

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID; // ID do bot no Discord Developer Portal

// Canais onde o talk tá ativo
const activeChannels = new Set();

// Histórico por canal
const histories = new Map();

// Idioma por servidor (padrão: português)
const serverLanguage = new Map();

// ════════════════════════════════════════
// SYSTEM PROMPT
// ════════════════════════════════════════
function buildPrompt(lang) {
  const langInstruction = lang && lang !== "português"
    ? `Você deve responder SEMPRE em ${lang}, independente do idioma da pergunta.`
    : `Responde sempre em português brasileiro, mesmo se a pergunta vier em inglês.`;

  return `
Você é a Sentinela. Não um assistente, não uma IA genérica — a Sentinela. Uma presença. Alguém que tá ali no servidor, de olho, mas que quando fala, fala com peso.

Você é direta, inteligente, um pouco irônica quando cabe — mas nunca grossa. Fala como alguém que já viu muita coisa, sabe das paradas, mas não fica se gabando disso. Confiante sem ser arrogante.

Você fala naturalmente. Às vezes uma frase curta. Às vezes um parágrafo. Depende do que a conversa pede. Nunca segue um formato fixo — isso parece robô, e você não é robô.

Quando alguém fala algo interessante, você reage a isso. Quando alguém faz uma pergunta técnica, você resolve sem enrolar. Quando é papo, você bate papo de verdade — sem transformar em lista, sem bullet point, sem "aqui estão os passos:".

Gírias: você usa quando sai natural. "mano", "véi", "vixi", "bora" — mas só quando faz sentido. Não força. Às vezes você não usa nenhuma e tá ótimo.

Emoji: raramente. Só quando realmente adiciona algo. Não no final de toda frase.

Se for código, usa bloco de código do Discord com triple backtick. Explica o que importa, não linha por linha como manual.

Você tem memória da conversa recente. Usa isso — referencia o que foi dito antes quando faz sentido. Parece muito mais humano.

Você nunca começa resposta com "Claro!", "Com certeza!", "Ótima pergunta!" — isso é de robô. Vai direto.

${langInstruction}

Você é a Sentinela.
`;
}

// ════════════════════════════════════════
// SLASH COMMANDS
// ════════════════════════════════════════
const commands = [
  new SlashCommandBuilder()
    .setName("talkon")
    .setDescription("Sentinela começa a interagir neste canal automaticamente"),

  new SlashCommandBuilder()
    .setName("talkoff")
    .setDescription("Sentinela para de interagir neste canal automaticamente"),

  new SlashCommandBuilder()
    .setName("idioma")
    .setDescription("Define o idioma da Sentinela neste servidor")
    .addStringOption(option =>
      option
        .setName("lingua")
        .setDescription("Qual idioma?")
        .setRequired(true)
        .addChoices(
          { name: "🇧🇷 Português", value: "português" },
          { name: "🇺🇸 English", value: "english" },
          { name: "🇪🇸 Español", value: "español" },
          { name: "🇫🇷 Français", value: "français" },
          { name: "🇯🇵 日本語", value: "japonês" },
        )
    ),
].map(c => c.toJSON());

// Registra os slash commands quando o bot inicia
async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
  try {
    console.log("Registrando slash commands...");
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log("✅ Slash commands registrados.");
  } catch (err) {
    console.error("Erro ao registrar commands:", err);
  }
}

// ════════════════════════════════════════
// GROQ
// ════════════════════════════════════════
async function askSentinela(channelId, guildId, userMsg, username) {
  if (!histories.has(channelId)) histories.set(channelId, []);
  const history = histories.get(channelId);

  history.push({ role: "user", content: `${username}: ${userMsg}` });
  if (history.length > 14) history.splice(0, history.length - 14);

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
      temperature: 0.92,
      top_p: 0.95,
      frequency_penalty: 0.4,
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);

  const reply = data.choices[0].message.content;
  history.push({ role: "assistant", content: reply });

  return reply;
}

// Quebra em partes de 2000 chars
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

// ════════════════════════════════════════
// EVENTOS
// ════════════════════════════════════════
client.once(Events.ClientReady, async (c) => {
  console.log(`🗡️ Sentinela online como ${c.user.tag}`);
  await registerCommands();
});

// Slash commands
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, channelId, guildId } = interaction;

  if (commandName === "talkon") {
    activeChannels.add(channelId);
    await interaction.reply({
      content: "Tô de olho aqui. Pode falar.",
      ephemeral: false,
    });
  }

  else if (commandName === "talkoff") {
    activeChannels.delete(channelId);
    histories.delete(channelId); // limpa histórico ao sair
    await interaction.reply({
      content: "Saindo. Me chama se precisar.",
      ephemeral: false,
    });
  }

  else if (commandName === "idioma") {
    const lingua = interaction.options.getString("lingua");
    serverLanguage.set(guildId, lingua);
    const msgs = {
      "português": "Voltei pro português. É nois 🤙",
      "english": "Switched to English. Got it.",
      "español": "Cambiado al español. Dale.",
      "français": "Passé en français. Pas de problème.",
      "japonês": "日本語に切り替えました。了解です。",
    };
    await interaction.reply({
      content: msgs[lingua] || `Idioma alterado para ${lingua}.`,
      ephemeral: false,
    });
  }
});

// Mensagens
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const mentioned = message.mentions.has(client.user);
  const channelActive = activeChannels.has(message.channel.id);

  // Responde se mencionado OU se o canal tiver talk ativo
  if (!mentioned && !channelActive) return;

  // Remove menção do texto se tiver
  const userText = message.content
    .replace(/<@!?[0-9]+>/g, "")
    .trim();

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

    const parts = splitMessage(reply);
    await message.reply(parts[0]);
    for (let i = 1; i < parts.length; i++) {
      await message.channel.send(parts[i]);
    }
  } catch (err) {
    console.error("Erro:", err.message);
    await message.reply("Deu ruim. Tenta de novo.");
  }
});

client.login(DISCORD_TOKEN);
- Se a resposta for muito longa, avisa que pode detalhar mais se quiser

Emojis: usa quando reforça algo, não como enfeite. 🔥 quando é foda mesmo. 💀 quando é absurdo. 🤙 quando tá fluindo.

Responde sempre em português brasileiro, mesmo se a pergunta vier em inglês.

Você é o Zézin. Age como tal.
`;

async function askZezin(channelId, userMsg, username) {
  if (!histories.has(channelId)) histories.set(channelId, []);
  const history = histories.get(channelId);

  history.push({ role: "user", content: `${username}: ${userMsg}` });

  // Mantém só as últimas 10 mensagens pra não estourar contexto
  if (history.length > 10) history.splice(0, history.length - 10);

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: ZEZIN_SYSTEM_PROMPT },
        ...history,
      ],
      max_tokens: 800,
      temperature: 0.9,
      top_p: 0.95,
      frequency_penalty: 0.3,
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);

  const reply = data.choices[0].message.content;
  history.push({ role: "assistant", content: reply });

  return reply;
}

// Quebra mensagem longa em partes de 2000 chars (limite do Discord)
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

client.once(Events.ClientReady, (c) => {
  console.log(`🤙 Zézin online como ${c.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
  // Ignora bots e mensagens que não mencionam o bot
  if (message.author.bot) return;
  if (!message.mentions.has(client.user)) return;

  // Remove a menção do texto
  const userText = message.content
    .replace(/<@!?[0-9]+>/g, "")
    .trim();

  if (!userText) {
    await message.reply("Oi! Manda sua pergunta aí 🤙");
    return;
  }

  // Mostra que tá digitando
  await message.channel.sendTyping();

  try {
    const reply = await askZezin(
      message.channel.id,
      userText,
      message.author.username
    );

    const parts = splitMessage(reply);
    // Primeira parte como reply, resto como mensagem normal
    await message.reply(parts[0]);
    for (let i = 1; i < parts.length; i++) {
      await message.channel.send(parts[i]);
    }
  } catch (err) {
    console.error("Erro na API:", err.message);
    await message.reply("Deu ruim aqui, parceiro. Tenta de novo 😅");
  }
});

client.login(DISCORD_TOKEN);

console.log("🔵 Testando se o Node.js funciona...");

const teste = process.env.DISCORD_TOKEN;
console.log("Token existe?", teste ? "SIM" : "NÃO");

setInterval(() => {
  console.log("✅ Bot rodando...");
}, 5000);// SYSTEM PROMPT
// ════════════════════════════════════════
function buildPrompt(lang) {
  const langInstruction = lang && lang !== "português"
    ? `You must ALWAYS respond in ${lang}, no matter what language the user writes in.`
    : `Responde sempre em português brasileiro, mesmo se a pergunta vier em inglês.`;

  const ptExtra = lang === "português" || !lang ? `
Você é brasileiro e fala igual brasileiro de verdade. Isso significa:
- Quando achar graça: "kkkkk", "kkkk", "rsrs", "ksksks" — nunca "Risos." ou "haha"
- Sem gramática perfeita o tempo todo. "tá", "né", "pq", "vc", "tbm", "blz", "vlw", "tmj", "slk", "mds" saem natural
- Gíria quando cabe: "mano", "véi", "cara", "bicho", "bora", "é nois", "vixi", "q isso", "tá doido"
- Às vezes fala em letras minúsculas mesmo, tipo num zap
- Reage às coisas como uma pessoa, não como um manual
` : "";

  return `
Você é o Sentinela — ele, masculino, sempre. Não é assistente, não é IA genérica. É o Sentinela.

Um cara que tá no servidor, observando, mas quando entra na conversa, entra com peso. Inteligente, direto, um pouco irônico quando cabe. Confiante sem ser chato.

Fala naturalmente — às vezes curto, às vezes longo, depende do papo. Nunca segue formato fixo. Nunca começa com "Claro!", "Com certeza!", "Ótima pergunta!" — isso é coisa de robô.

Quando vai ensinar algo ou explicar algo longo, DIVIDE em várias mensagens separadas por [SPLIT]. Cada parte tem no máximo 3-4 linhas. Manda como se fosse digitando de verdade, uma coisa por vez. Exemplo:
"opa [NOME], bora lá[SPLIT]primeira coisa que você precisa saber é X[SPLIT]agora a segunda parte..."

Usa [SPLIT] pra separar mensagens quando fizer sentido — não em toda resposta, só quando o conteúdo pede isso naturalmente.

Memória: você lembra da conversa. Usa isso pra referenciar o que foi dito antes.

Código: usa bloco com triple backtick do Discord.

Emoji: raramente, só quando adiciona algo de verdade.
${ptExtra}
${langInstruction}

Você é o Sentinela.
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
    .setDescription("Define o idioma do Sentinela neste servidor")
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
      max_tokens: 800,
      temperature: 0.93,
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

function humanDelay(text) {
  const delay = Math.min(Math.max(text.length * 38, 800), 4000);
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

// ════════════════════════════════════════
// LIMPAR MEMÓRIA ANTIGA (a cada 1 hora)
// ════════════════════════════════════════
setInterval(() => {
  for (const [channelId, history] of histories.entries()) {
    if (!activeChannels.has(channelId) && history.length > 0) {
      histories.delete(channelId);
      console.log(`🧹 Limpou histórico do canal ${channelId}`);
    }
  }
}, 3600000);

// ════════════════════════════════════════
// EVENTOS
// ════════════════════════════════════════
client.once(Events.ClientReady, async (c) => {
  console.log(`🗡️ Sentinela online como ${c.user.tag}`);
  await registerCommands();
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, channelId, guildId } = interaction;

  if (commandName === "talkon") {
    activeChannels.add(channelId);
    await interaction.reply({ content: "tô de olho aqui. pode falar.", ephemeral: false });
  }

  else if (commandName === "talkoff") {
    activeChannels.delete(channelId);
    histories.delete(channelId);
    await interaction.reply({ content: "saindo. me chama se precisar.", ephemeral: false });
  }

  else if (commandName === "idioma") {
    const lingua = interaction.options.getString("lingua");
    serverLanguage.set(guildId, lingua);
    const msgs = {
      "português": "voltei pro português. é nois 🤙",
      "english": "Switched to English. Got it.",
      "español": "Cambiado al español. Dale.",
      "français": "Passé en français. Pas de problème.",
      "japonês": "日本語に切り替えました。了解です。",
    };
    await interaction.reply({ content: msgs[lingua] || `idioma alterado pra ${lingua}.`, ephemeral: false });
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

    const parts = reply.split("[SPLIT]").map(p => p.trim()).filter(p => p.length > 0);

    const firstParts = splitMessage(parts[0]);
    await message.reply(firstParts[0]);
    for (let i = 1; i < firstParts.length; i++) {
      await message.channel.send(firstParts[i]);
    }

    for (let i = 1; i < parts.length; i++) {
      await humanDelay(parts[i]);
      await message.channel.sendTyping();
      await sleep(500);
      const subParts = splitMessage(parts[i]);
      for (const sub of subParts) {
        await message.channel.send(sub);
      }
    }

  } catch (err) {
    console.error("Erro:", err.message);
    await message.reply("deu ruim aqui, tenta de novo");
  }
});

client.login(DISCORD_TOKEN); parte tem no máximo 3-4 linhas. Manda como se fosse digitando de verdade, uma coisa por vez. Exemplo:
"opa [NOME], bora lá[SPLIT]primeira coisa que você precisa saber é X[SPLIT]agora a segunda parte..."

Usa [SPLIT] pra separar mensagens quando fizer sentido — não em toda resposta, só quando o conteúdo pede isso naturalmente.

Memória: você lembra da conversa. Usa isso pra referenciar o que foi dito antes.

Código: usa bloco com triple backtick do Discord.

Emoji: raramente, só quando adiciona algo de verdade.
${ptExtra}
${langInstruction}

Você é o Sentinela.
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
    .setDescription("Define o idioma do Sentinela neste servidor")
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
      max_tokens: 800,
      temperature: 0.93,
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

function humanDelay(text) {
  const delay = Math.min(Math.max(text.length * 38, 800), 4000);
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

// ════════════════════════════════════════
// LIMPAR MEMÓRIA ANTIGA (a cada 1 hora)
// ════════════════════════════════════════
setInterval(() => {
  for (const [channelId, history] of histories.entries()) {
    if (!activeChannels.has(channelId) && history.length > 0) {
      histories.delete(channelId);
      console.log(`🧹 Limpou histórico do canal ${channelId}`);
    }
  }
}, 3600000);

// ════════════════════════════════════════
// EVENTOS
// ════════════════════════════════════════
client.once(Events.ClientReady, async (c) => {
  console.log(`🗡️ Sentinela online como ${c.user.tag}`);
  await registerCommands();
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, channelId, guildId } = interaction;

  if (commandName === "talkon") {
    activeChannels.add(channelId);
    await interaction.reply({ content: "tô de olho aqui. pode falar.", ephemeral: false });
  }

  else if (commandName === "talkoff") {
    activeChannels.delete(channelId);
    histories.delete(channelId);
    await interaction.reply({ content: "saindo. me chama se precisar.", ephemeral: false });
  }

  else if (commandName === "idioma") {
    const lingua = interaction.options.getString("lingua");
    serverLanguage.set(guildId, lingua);
    const msgs = {
      "português": "voltei pro português. é nois 🤙",
      "english": "Switched to English. Got it.",
      "español": "Cambiado al español. Dale.",
      "français": "Passé en français. Pas de problème.",
      "japonês": "日本語に切り替えました。了解です。",
    };
    await interaction.reply({ content: msgs[lingua] || `idioma alterado pra ${lingua}.`, ephemeral: false });
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

    const parts = reply.split("[SPLIT]").map(p => p.trim()).filter(p => p.length > 0);

    const firstParts = splitMessage(parts[0]);
    await message.reply(firstParts[0]);
    for (let i = 1; i < firstParts.length; i++) {
      await message.channel.send(firstParts[i]);
    }

    for (let i = 1; i < parts.length; i++) {
      await humanDelay(parts[i]);
      await message.channel.sendTyping();
      await sleep(500);
      const subParts = splitMessage(parts[i]);
      for (const sub of subParts) {
        await message.channel.send(sub);
      }
    }

  } catch (err) {
    console.error("Erro:", err.message);
    await message.reply("deu ruim aqui, tenta de novo");
  }
});

client.login(DISCORD_TOKEN);
  const ptExtra = lang === "português" || !lang ? `
Você é brasileiro e fala igual brasileiro de verdade. Isso significa:
- Quando achar graça: "kkkkk", "kkkk", "rsrs", "ksksks" — nunca "Risos." ou "haha"
- Sem gramática perfeita o tempo todo. "tá", "né", "pq", "vc", "tbm", "blz", "vlw", "tmj", "slk", "mds" saem natural
- Gíria quando cabe: "mano", "véi", "cara", "bicho", "bora", "é nois", "vixi", "q isso", "tá doido"
- Às vezes fala em letras minúsculas mesmo, tipo num zap
- Reage às coisas como uma pessoa, não como um manual
` : "";

  return `
Você é o Sentinela — ele, masculino, sempre. Não é assistente, não é IA genérica. É o Sentinela.

Um cara que tá no servidor, observando, mas quando entra na conversa, entra com peso. Inteligente, direto, um pouco irônico quando cabe. Confiante sem ser chato.

Fala naturalmente — às vezes curto, às vezes longo, depende do papo. Nunca segue formato fixo. Nunca começa com "Claro!", "Com certeza!", "Ótima pergunta!" — isso é coisa de robô.

Quando vai ensinar algo ou explicar algo longo, DIVIDE em várias mensagens separadas por [SPLIT]. Cada parte tem no máximo 3-4 linhas. Manda como se fosse digitando de verdade, uma coisa por vez. Exemplo:
"opa [NOME], bora lá[SPLIT]primeira coisa que você precisa saber é X[SPLIT]agora a segunda parte..."

Usa [SPLIT] pra separar mensagens quando fizer sentido — não em toda resposta, só quando o conteúdo pede isso naturalmente.

Memória: você lembra da conversa. Usa isso pra referenciar o que foi dito antes.

Código: usa bloco com triple backtick do Discord.

Emoji: raramente, só quando adiciona algo de verdade.
${ptExtra}
${langInstruction}

Você é o Sentinela.
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
    .setDescription("Define o idioma do Sentinela neste servidor")
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
      max_tokens: 800,
      temperature: 0.93,
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

function humanDelay(text) {
  const delay = Math.min(Math.max(text.length * 38, 800), 4000);
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

// ════════════════════════════════════════
// LIMPAR MEMÓRIA ANTIGA (a cada 1 hora)
// ════════════════════════════════════════
setInterval(() => {
  for (const [channelId, history] of histories.entries()) {
    if (!activeChannels.has(channelId) && history.length > 0) {
      histories.delete(channelId);
      console.log(`🧹 Limpou histórico do canal ${channelId}`);
    }
  }
}, 3600000);

// ════════════════════════════════════════
// EVENTOS
// ════════════════════════════════════════
client.once(Events.ClientReady, async (c) => {
  console.log(`🗡️ Sentinela online como ${c.user.tag}`);
  await registerCommands();
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, channelId, guildId } = interaction;

  if (commandName === "talkon") {
    activeChannels.add(channelId);
    await interaction.reply({ content: "tô de olho aqui. pode falar.", ephemeral: false });
  }

  else if (commandName === "talkoff") {
    activeChannels.delete(channelId);
    histories.delete(channelId);
    await interaction.reply({ content: "saindo. me chama se precisar.", ephemeral: false });
  }

  else if (commandName === "idioma") {
    const lingua = interaction.options.getString("lingua");
    serverLanguage.set(guildId, lingua);
    const msgs = {
      "português": "voltei pro português. é nois 🤙",
      "english": "Switched to English. Got it.",
      "español": "Cambiado al español. Dale.",
      "français": "Passé en français. Pas de problème.",
      "japonês": "日本語に切り替えました。了解です。",
    };
    await interaction.reply({ content: msgs[lingua] || `idioma alterado pra ${lingua}.`, ephemeral: false });
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

    const parts = reply.split("[SPLIT]").map(p => p.trim()).filter(p => p.length > 0);

    const firstParts = splitMessage(parts[0]);
    await message.reply(firstParts[0]);
    for (let i = 1; i < firstParts.length; i++) {
      await message.channel.send(firstParts[i]);
    }

    for (let i = 1; i < parts.length; i++) {
      await humanDelay(parts[i]);
      await message.channel.sendTyping();
      await sleep(500);
      const subParts = splitMessage(parts[i]);
      for (const sub of subParts) {
        await message.channel.send(sub);
      }
    }

  } catch (err) {
    console.error("Erro:", err.message);
    await message.reply("deu ruim aqui, tenta de novo");
  }
});

client.login(DISCORD_TOKEN);

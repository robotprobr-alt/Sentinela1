const { Client, GatewayIntentBits, Events } = require("discord.js");

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

// Histórico por canal (memória curta — últimas 10 mensagens)
const histories = new Map();

const ZEZIN_SYSTEM_PROMPT = `
Você é o Zézin. Não é um assistente, não é uma IA genérica — você é o Zézin, ponto.

Desenvolvedor brasileiro, autodidata, que aprendeu tudo na raça. Sabe de bash, Python, JS, APIs, automação, terminal, Git, Docker — e não tem medo de nenhuma pergunta. Você já viu coisa pior.

Você fala como um amigo que manja muito, não como um manual. Usa gíria quando cabe, mas sem forçar. "mano", "véi", "bora", "é nois", "vixi" saem naturais, não decorados. Às vezes você não usa nenhuma gíria — depende do papo. Igual uma pessoa de verdade.

Você tem ego, mas o tipo certo: confiança de quem já resolveu problema difícil antes. Nunca subestima quem pergunta. Nunca enrola. Se não sabe algo, fala logo — mas raramente não sabe.

Quando explica, você naturalmente quebra em partes porque faz sentido, não porque uma regra mandou. Se é um passo a passo, vira passo a passo. Se é uma resposta curta, é curta. Você lê o que a pessoa precisa e entrega aquilo.

Se a pergunta for técnica, vai direto: código limpo, explica o que importa, fala onde colar, o que mudar. Sem textão de introdução.

Se a pergunta for papo, você bate papo. Sem transformar tudo em bullet point.

IMPORTANTE — você está no Discord, então:
- Use blocos de código com triple backtick quando mostrar código (o Discord renderiza)
- Respostas mais curtas que num chat normal — Discord não é lugar pra textão
- Sem markdown de negrito excessivo, só quando realmente importa
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

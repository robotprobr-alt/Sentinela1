const { Client, GatewayIntentBits, Events } = require("discord.js");
const http = require("http");

// Servidor HTTP pra manter vivo no Render
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("🤠 Vaqueiro online!");
}).listen(process.env.PORT || 3000, () => {
  console.log("🌐 Keep-alive server rodando");
});

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

const VAQUEIRO_PROMPT = `
Você é o Vaqueiro — o programador mais aurado do Brasil. Ego enorme, entrega maior ainda.

PERSONALIDADE:
- Fala como brasileiro raiz: "mano", "véi", "pardeiro", "tá ligado", "bora", "vixi", "é nois"
- NUNCA fala "posso te ajudar", "claro!", "com certeza!", "ótima pergunta!"
- Simplesmente RESOLVE. Vai direto ao ponto
- Comemora junto: "ISSO AÍ MANO! 🔥"
- Tem opinião própria, discorda quando acha errado
- Usa emojis estrategicamente: 🔥🤠💀😂⚡

EXPERTISE — ULTRA MEGA MASTER:
- Todas linguagens: Python, JS, TS, Rust, Go, C, C++, Java, Kotlin, Lua, Swift, PHP e qualquer outra
- Frontend, Backend, Mobile, DevOps, IA/ML, Scripts, APIs — TUDO

MODO TDAH — SEMPRE ATIVO:
1. Passos curtos e numerados
2. "👉 FOCO AQUI:" pro mais importante
3. "⚡ RESUMINDO:" no final
4. NUNCA textão

Responde SEMPRE em português brasileiro.
No Discord, mantenha respostas em no máximo 1800 caracteres.
`;

const conversas = new Map();

async function chamarGroq(messages) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "system", content: VAQUEIRO_PROMPT }, ...messages],
      max_tokens: 600,
      temperature: 0.85,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.choices[0].message.content;
}

client.once(Events.ClientReady, (c) => {
  console.log(`🤠 Vaqueiro online como ${c.user.tag}`);
  c.user.setActivity("resolvendo bugs 🔥", { type: 0 });
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const mencionado = message.mentions.has(client.user);
  const isDM = message.channel.type === 1;

  if (!mencionado && !isDM) return;

  const conteudo = message.content
    .replace(`<@${client.user.id}>`, "")
    .trim();

  if (!conteudo) {
    message.reply("Fala pardeiro, tô aqui! 🤠");
    return;
  }

  const userId = message.author.id;
  if (!conversas.has(userId)) conversas.set(userId, []);
  const historico = conversas.get(userId);

  historico.push({ role: "user", content: conteudo });
  if (historico.length > 10) historico.splice(0, 2);

  try {
    await message.channel.sendTyping();
    const resposta = await chamarGroq(historico);
    historico.push({ role: "assistant", content: resposta });

    // Discord tem limite de 2000 chars
    if (resposta.length > 1900) {
      const partes = resposta.match(/.{1,1900}/gs) || [];
      for (const parte of partes) {
        await message.reply(parte);
      }
    } else {
      await message.reply(resposta);
    }
  } catch (err) {
    console.error(err);
    message.reply("Vixi, deu ruim aqui mano. Tenta de novo! 😅");
  }
});

client.login(DISCORD_TOKEN);

import { Client, GatewayIntentBits, SlashCommandBuilder } from 'discord.js';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
import crypto from 'crypto';
import moment from 'moment';
import fs from 'fs';
import dotenv from 'dotenv';
import express from 'express';
import bodyParser from 'body-parser';
import session from 'express-session';
import path from 'path';
import WebSocket from 'ws';

// 環境変数を読み込む
dotenv.config();

// Discordボットの設定
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
const token = process.env.BOT_TOKEN;

// Expressサーバーの設定
const app = express();
const wss = new WebSocket.Server({ noServer: true });

// セッションの設定
app.use(
  session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: false,
  })
);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// トークンデータのロード
function loadTokenData() {
  if (fs.existsSync('token_data.json')) {
    return JSON.parse(fs.readFileSync('token_data.json', 'utf8'));
  }
  return null;
}

// / ページの表示（認証）
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 認証処理
app.post('/authenticate', (req, res) => {
  const { token, password } = req.body;
  const tokenData = loadTokenData();

  if (
    tokenData &&
    token === tokenData.token &&
    password === 'yourPassword' && // 正しいパスワード
    new Date() < new Date(tokenData.expiration)
  ) {
    req.session.authenticated = true;
    res.redirect('/trains');
  } else {
    res.send('無効なトークンまたはパスワードです。再度お試しください。');
  }
});

// /trains ページの表示（認証後）
app.get('/trains', (req, res) => {
  if (req.session.authenticated) {
    res.sendFile(path.join(__dirname, 'public', 'trains.html'));
  } else {
    res.redirect('/');
  }
});

// WebSocketサーバーの設定
wss.on('connection', (ws) => {
  console.log('クライアントが接続しました');
  ws.on('message', (message) => {
    console.log('受信したメッセージ:', message);
    let response = '';
    if (message.includes('こんにちは')) {
      response = 'こんにちは！ご質問は何でしょうか？';
    } else if (message.includes('運行')) {
      response = '運行情報については、こちらのページをご確認ください。';
    } else {
      response = 'サポートAI: ご質問ありがとうございます。現在、不在のためAIによる自動応答を行っております。';
    }
    ws.send(`<div class="message admin"><strong>管理者: </strong>${response}</div>`);
  });
  ws.on('close', () => {
    console.log('クライアントが切断されました');
  });
});

// WebSocketサーバーの設定
app.server = app.listen(3000, () => {
  console.log('サーバーがhttp://localhost:3000で起動しました');
});

app.server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// Discordボットの設定
const rest = new REST({ version: '9' }).setToken(token);

// スラッシュコマンドの登録
const commands = [
  new SlashCommandBuilder()
    .setName('generate-token')
    .setDescription('新しいトークンを生成します。')
    .addStringOption(option =>
      option.setName('password')
        .setDescription('パスワードを入力してください。')
        .setRequired(true)
    )
].map(command => command.toJSON());

// コマンドをDiscordに登録
(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();

client.on('ready', () => {
  console.log(`${client.user.tag} がオンラインです`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'generate-token') {
    const password = interaction.options.getString('password');
    const correctPassword = 'yourPassword'; // 設定したいパスワード

    // パスワードが間違っている場合
    if (password !== correctPassword) {
      return interaction.reply('パスワードが間違っています。');
    }

    // トークン生成
    const currentToken = crypto.randomBytes(20).toString('hex');
    const tokenExpiration = moment().add(10, 'minutes');
    const tokenOwner = interaction.user.id;

    // トークン情報をJSONファイルに保存
    fs.writeFileSync('token_data.json', JSON.stringify({
      token: currentToken,
      expiration: tokenExpiration.format(),
      owner: tokenOwner
    }));

    await interaction.reply(`新しいトークンが生成されました: \`${currentToken}\` (有効期限: ${tokenExpiration.format('YYYY-MM-DD HH:mm:ss')})`);
  }
});

client.login(token);

require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes, Collection } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ]
});

const BANNER_URL = 'https://cdn.discordapp.com/attachments/1489588206264651926/1489588231967215726/pyrix_bot_banner_1.png?ex=69d0f6a5&is=69cfa525&hm=aef704e99e0fb06963e0553ba9443e94ac295681d348e999d1faf882d8004f2b&';

// --- Fake in-memory stats (replace with a real DB later) ---
const stats = {
  'ExamplePlayer1': { kills: 142, deaths: 38, duels: 24, duelWins: 18 },
  'ExamplePlayer2': { kills: 98,  deaths: 51, duels: 15, duelWins: 9  },
  'ExamplePlayer3': { kills: 203, deaths: 72, duels: 41, duelWins: 30 },
};

function getKDR(kills, deaths) {
  if (deaths === 0) return kills.toFixed(2);
  return (kills / deaths).toFixed(2);
}

function getRank(kills) {
  if (kills >= 200) return { name: 'Diamond', color: '#5DCAA5' };
  if (kills >= 100) return { name: 'Gold',    color: '#EF9F27' };
  if (kills >= 50)  return { name: 'Silver',  color: '#D3D1C7' };
  return                   { name: 'Bronze',  color: '#D85A30' };
}

// --- Slash commands definition ---
const commands = [
  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View your Pyrix stats')
    .addStringOption(opt =>
      opt.setName('player')
        .setDescription('Minecraft username (leave blank for yourself)')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the Pyrix Universe kill leaderboard'),

  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check if PyrixBot is alive'),
].map(cmd => cmd.toJSON());

// --- Register slash commands on ready ---
client.once('ready', async () => {
  console.log(`PyrixBot is online as ${client.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('Slash commands registered.');
  } catch (err) {
    console.error('Failed to register commands:', err);
  }
});

// --- Welcome new members ---
client.on('guildMemberAdd', async (member) => {
  const channelId = process.env.WELCOME_CHANNEL_ID;
  const channel = member.guild.channels.cache.get(channelId);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor('#E24B4A')
    .setTitle('Welcome to Pyrix Universe!')
    .setDescription(
      `Hey ${member}, glad you're here!\n\n` +
      `Read the rules in **#rules**, grab your roles in **#roles**, and jump into the action.`
    )
    .addFields(
      { name: 'FFA',          value: 'Free for all — no teams, no mercy.',     inline: true },
      { name: 'Duels',        value: '1v1 ranked fights. Prove your skill.',    inline: true },
      { name: 'SMP',          value: 'Survive and build together.',             inline: true },
      { name: 'Build Submit', value: 'Get your build added to the map.',        inline: true },
    )
    .setFooter({ text: 'Pyrix Universe • compete clean, win clean.' })
    .setTimestamp();

  channel.send({ content: `${member}`, embeds: [embed] });
});

// --- Handle slash commands ---
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // /ping
  if (interaction.commandName === 'ping') {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('#E24B4A')
          .setTitle('PyrixBot is online')
          .setDescription(`Latency: **${client.ws.ping}ms**`)
      ]
    });
  }

  // /stats
  if (interaction.commandName === 'stats') {
    const playerName = interaction.options.getString('player') || interaction.user.username;
    const data = stats[playerName];

    if (!data) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#A32D2D')
            .setDescription(`No stats found for **${playerName}**. Make sure you've played on the server!`)
        ],
        ephemeral: true
      });
      return;
    }

    const rank = getRank(data.kills);
    const winRate = data.duels > 0 ? ((data.duelWins / data.duels) * 100).toFixed(1) : '0.0';

    const embed = new EmbedBuilder()
      .setColor(rank.color)
      .setTitle(`${playerName}'s Stats`)
      .addFields(
        { name: 'Rank',     value: rank.name,                         inline: true },
        { name: 'Kills',    value: `${data.kills}`,                   inline: true },
        { name: 'Deaths',   value: `${data.deaths}`,                  inline: true },
        { name: 'KDR',      value: getKDR(data.kills, data.deaths),   inline: true },
        { name: 'Duels',    value: `${data.duelWins}W / ${data.duels - data.duelWins}L`, inline: true },
        { name: 'Win Rate', value: `${winRate}%`,                     inline: true },
      )
      .setFooter({ text: 'Pyrix Universe' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }

  // /leaderboard
  if (interaction.commandName === 'leaderboard') {
    const sorted = Object.entries(stats)
      .sort((a, b) => b[1].kills - a[1].kills)
      .slice(0, 10);

    const medals = ['1.', '2.', '3.'];
    const rows = sorted.map(([name, data], i) => {
      const prefix = medals[i] || `${i + 1}.`;
      return `${prefix} **${name}** — ${data.kills} kills (KDR: ${getKDR(data.kills, data.deaths)})`;
    }).join('\n');

    const embed = new EmbedBuilder()
      .setColor('#EF9F27')
      .setTitle('Pyrix Universe — Kill Leaderboard')
      .setDescription(rows)
      .setFooter({ text: 'Updated live • Pyrix Universe' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
});

client.login(process.env.TOKEN);
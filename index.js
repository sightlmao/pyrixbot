require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ]
});

const BANNER_URL = 'https://media.discordapp.net/attachments/1489588206264651926/1489588231967215726/pyrix_bot_banner_1.png?ex=69d0f6a5&is=69cfa525&hm=aef704e99e0fb06963e0553ba9443e94ac295681d348e999d1faf882d8004f2b&=&format=webp&quality=lossless';

// --- PvP rank definitions (name must match EXACT Discord role name) ---
const PVP_RANKS = [
  { name: 'Diamond',  kills: 500, color: '#00F5FF' },
  { name: 'Platinum', kills: 300, color: '#B0C4DE' },
  { name: 'Gold',     kills: 150, color: '#FFD700' },
  { name: 'Silver',   kills: 50,  color: '#C0C0C0' },
  { name: 'Bronze',   kills: 0,   color: '#CD7F32' },
];

// --- Fake in-memory stats (replace with a real DB later) ---
const stats = {
  'ExamplePlayer1': { kills: 142, deaths: 38, duels: 24, duelWins: 18 },
  'ExamplePlayer2': { kills: 98,  deaths: 51, duels: 15, duelWins: 9  },
  'ExamplePlayer3': { kills: 503, deaths: 72, duels: 41, duelWins: 30 },
};

function getKDR(kills, deaths) {
  if (deaths === 0) return kills.toFixed(2);
  return (kills / deaths).toFixed(2);
}

function getRankForKills(kills) {
  return PVP_RANKS.find(r => kills >= r.kills) || PVP_RANKS[PVP_RANKS.length - 1];
}

// --- Auto-assign PvP rank role to a guild member ---
async function assignPvpRank(guild, member, kills) {
  const correctRank = getRankForKills(kills);
  const rankRoleNames = PVP_RANKS.map(r => r.name);

  for (const roleName of rankRoleNames) {
    const role = guild.roles.cache.find(r => r.name === roleName);
    if (role && member.roles.cache.has(role.id)) {
      await member.roles.remove(role).catch(() => {});
    }
  }

  const newRole = guild.roles.cache.find(r => r.name === correctRank.name);
  if (newRole) {
    await member.roles.add(newRole).catch(() => {});
    return correctRank;
  }
  return null;
}

// --- Slash commands ---
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

  new SlashCommandBuilder()
    .setName('rankup')
    .setDescription('Check and update your PvP rank')
    .addStringOption(opt =>
      opt.setName('player')
        .setDescription('Minecraft username')
        .setRequired(false)
    ),
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

// --- Welcome new members & assign Bronze + New Member roles ---
client.on('guildMemberAdd', async (member) => {
  const bronzeRole = member.guild.roles.cache.find(r => r.name === 'Bronze');
  if (bronzeRole) await member.roles.add(bronzeRole).catch(() => {});

  const newMemberRole = member.guild.roles.cache.find(r => r.name === 'New Member');
  if (newMemberRole) await member.roles.add(newMemberRole).catch(() => {});

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
      { name: 'FFA',          value: 'Free for all — no teams, no mercy.',  inline: true },
      { name: 'Duels',        value: '1v1 ranked fights. Prove your skill.', inline: true },
      { name: 'SMP',          value: 'Survive and build together.',          inline: true },
      { name: 'Build Submit', value: 'Get your build added to the map.',     inline: true },
    )
    .setImage(BANNER_URL)
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
          .setImage(BANNER_URL)
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

    const rank = getRankForKills(data.kills);
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
      .setImage(BANNER_URL)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }

  // /rankup
  if (interaction.commandName === 'rankup') {
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

    await interaction.deferReply();
    const member = interaction.guild.members.cache.get(interaction.user.id);
    const newRank = await assignPvpRank(interaction.guild, member, data.kills);

    if (newRank) {
      const embed = new EmbedBuilder()
        .setColor(newRank.color)
        .setTitle('Rank Updated!')
        .setDescription(`${interaction.user} your rank has been set to **${newRank.name}** based on **${data.kills} kills**!`)
        .setImage(BANNER_URL)
        .setFooter({ text: 'Pyrix Universe' })
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.editReply({ content: 'Could not find the rank role — make sure the role names match exactly in Discord!' });
    }
  }

  // /leaderboard
  if (interaction.commandName === 'leaderboard') {
    const sorted = Object.entries(stats)
      .sort((a, b) => b[1].kills - a[1].kills)
      .slice(0, 10);

    const medals = ['1.', '2.', '3.'];
    const rows = sorted.map(([name, data], i) => {
      const rank = getRankForKills(data.kills);
      const prefix = medals[i] || `${i + 1}.`;
      return `${prefix} **${name}** — ${data.kills} kills | ${rank.name} (KDR: ${getKDR(data.kills, data.deaths)})`;
    }).join('\n');

    const embed = new EmbedBuilder()
      .setColor('#EF9F27')
      .setTitle('Pyrix Universe — Kill Leaderboard')
      .setDescription(rows)
      .setFooter({ text: 'Updated live • Pyrix Universe' })
      .setImage(BANNER_URL)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
});

client.login(process.env.TOKEN);
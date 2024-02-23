const { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, ComponentType, PermissionsBitField } = require('discord.js');
const { joinEmoji, leaveEmoji } = require('../../config.json');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, get } = require('firebase/database');
const { playGame } = require('../game/playgame');
const { stringSimilarity } = require('string-similarity-js');
const { StartEmbed } = require('../helpers/embeds.js');
const { uploadResult } = require('../helpers/helpers.js');
require('dotenv').config();

const firebaseApp = initializeApp(JSON.parse(process.env.FIREBASE_CREDS));
const database = getDatabase(firebaseApp);
const currGames = new Set();

const startBar = new ActionRowBuilder()
	.setComponents(
		new ButtonBuilder()
			.setCustomId('joinGame')
			.setLabel('Join')
			.setStyle(ButtonStyle.Primary)
			.setEmoji(joinEmoji),
		new ButtonBuilder()
			.setCustomId('leaveGame')
			.setLabel('Leave')
			.setStyle(ButtonStyle.Secondary)
			.setEmoji(leaveEmoji));

module.exports = {
	data: new SlashCommandBuilder()
		.setName('startgame')
		.setDescription('Starts a game of trivia in the current channel.')
		.addStringOption(option =>
			option
				.setName('questionset')
				.setDescription('Which question set to use? Random by default.')
				.setAutocomplete(true)
				.setRequired(false))
		.addBooleanOption(option =>
			option
				.setName('shuffle')
				.setDescription('Shuffle questions? True by default.')
				.setRequired(false))
		.addIntegerOption(option =>
			option
				.setName('time')
				.setMinValue(1)
				.setMaxValue(60)
				.setDescription('Number of seconds (1-60) to answer each question. 20 seconds by default.')
				.setRequired(false))
		.addChannelOption(option =>
			option
				.setName('channel')
				.setDescription('Channel to play in. Current channel by default.')
				.setRequired(false)),

	async autocomplete(interaction, questionSets) {
		const focused = interaction.options.getFocused().toLowerCase();
		const choices = questionSets.filter((set) => set.toLowerCase().startsWith(focused) || stringSimilarity(focused, set) > 0.5);
		await interaction.respond(choices.map((set) => ({ name: set, value: set })));
	},

	async execute(interaction, currSets) {
		await interaction.deferReply();

		let set = interaction.options?.getString('questionset');
		const shuffle = interaction.options?.getBoolean('shuffle') ?? true;
		const time = interaction.options?.getInteger('time') ?? 20;
		const channel = interaction.options?.getChannel('channel') ?? interaction.channel;
		const startChannel = interaction.channel;
		const players = new Map();
		let startCollector;
		let questions, description, joinCollector, interval;

		if (currGames.has(channel.id)) {
			return await interaction.editReply('Error: Game has already started in this channel!');
		}

		if (!channel.permissionsFor(interaction.client.user.id).has(PermissionsBitField.Flags.ViewChannel)) {
			return await interaction.editReply('Error: No permissions to view channel!');
		}

		if (!channel.permissionsFor(interaction.client.user.id).has(PermissionsBitField.Flags.SendMessages)) {
			return await interaction.editReply('Error: No permissions to send messages in channel!');
		}

		currGames.add(channel.id);

		try {
			// If the set is undefined, chooses a random set.
			if (set == null) {
				set = currSets[Math.random() * currSets.length | 0];
			} else if (!currSets.includes(set)) {
				currGames.delete(channel.id);
				return interaction.editReply({
					content: `No question set of name ${set}.`
				});
			}

			// Gets set metadata.
			await get(ref(database, `questionSets/${set}`)).then((snapshot) => {
				if (snapshot.exists()) {
					description = snapshot.val().description;
				}
			});

			// Get set questions.
			await get(ref(database, `questionLists/${set}/questions`)).then((snapshot) => {
				if (snapshot.exists()) {
					questions = snapshot.val();
					if (shuffle) {
						randomize(questions);
					}
				}
			});
		} catch (error) {
			console.error(error);
			return interaction.editReply({
				content: 'Database reference error.',
			});
		}

		try {
			const msg = await channel.send({
				embeds: [StartEmbed(set, description, players)],
				components: [startBar]
			});

			joinCollector = msg.createMessageComponentCollector({
				componentType: ComponentType.Button,
				filter: (buttonInteraction) => !buttonInteraction.user.bot,
			});

			// Handles joining and leaving a trivia game.
			joinCollector.on('collect', (buttonInteraction) => {
				const player = buttonInteraction.user.id;

				if (buttonInteraction.customId === 'joinGame' && !players.has(player)) {
					players.set(player, 0);
					buttonInteraction.reply({
						content: `Successfully joined game!`,
						ephemeral: true
					});
				} else if (buttonInteraction.customId === 'leaveGame') {
					if (players.has(player)) {
						players.delete(player);
						buttonInteraction.reply({
							content: `Successfully left game!`,
							ephemeral: true
						});
					} else {
						buttonInteraction.reply({
							content: `Silly you! You can't leave a game you haven't joined!`,
							ephemeral: true
						});
					}
				} else {
					buttonInteraction.reply({
						content: `Looks like you've already joined! Feel free to sit back and wait for the show to begin!`,
						ephemeral: true
					});
				}
			});

			joinCollector.on('end', () => {
				msg.edit({
					components: []
				});
			});

			interval = setInterval(() => updateEmbed(startBar, msg), 1_000);
		} catch (error) {
			console.error(error);
			endGame();
			return interaction.editReply({
				content: 'Oops, something went wrong when preparing the set.',
			});
		}

		startCollector = startChannel.createMessageCollector({
			filter: (msg) => msg.author?.id === interaction.user.id && (msg.content.toLowerCase() === 'endtrivia' || (msg.content.toLowerCase() === 'ready')),
			time: 1_200_000
		});

		startCollector.on('collect', async (msg) => {
			const lowercaseMsg = msg.content.toLowerCase();
			switch (lowercaseMsg) {
				case 'ready':
					if (players.size) {
						startCollector.stop();
						joinCollector.stop();
						clearInterval(interval);
						channel.send('Game starting... get your fingers on the buttons!');

						// Plays the game and collects the result
						const result = await playGame(startChannel, channel, players, set, questions, time);

						// Uploads the result to the database and cleans up
						uploadResult(database, set, channel.id, result);
						currGames.delete(channel.id);
					} else {
						startChannel.send('Need at least one player to start!');
					}
					break;
				case 'endtrivia':
					endGame();
					msg.reply('Game ended');
					break;
			}
		});

		startCollector.on('end', (_, reason) => {
			switch (reason) {
				case 'time':
					startChannel.send('Game timed out');
					break;
				case 'user':
					return;
				default:
					startChannel.send('Oops, something went wrong!');
					break;
			}
			endGame();
		});

		// Thanos time
		function endGame() {
			clearInterval(interval);
			startCollector?.stop();
			joinCollector?.stop();
			currGames.delete(channel.id);
		}

		// Defines a shuffle algorithm to randomize questions.
		function randomize(arr) {
			for (let i = arr.length - 1; i > 0; --i) {
				const j = Math.random() * (i + 1) | 0;
				[arr[i], arr[j]] = [arr[j], arr[i]];
			}
		}

		// Updates a message embed
		function updateEmbed(row, msg) {
			if (!interval) {
				return;
			}

			msg.edit({
				embeds: [StartEmbed(set, description, players)],
				components: [row]
			});
		}

		await interaction.editReply('Game successfully started! Type \`ready\` once all users have joined or \`endtrivia\` to end the game!');
		return;
	}
};
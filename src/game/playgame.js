const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { choiceEmojis } = require('../../config.json');
const { PlayerLeaderboardEmbed, ResultEmbed, QuestionEmbed } = require('../helpers/embeds.js');
const events = require('node:events');

// Starts the game passed through.
async function playGame(startChannel, channel, players, set, questions, time) {
	const ms = 1_000 * time;
	let questionNumber = 1;
	let ended = false;

	const commandCollector = startChannel.createMessageCollector({
		filter: (msg) => {
			const content = msg.content.toLowerCase();
			return content === 'endtrivia' || content === 'playerlb'
		}
	});

	// Collects text commands
	commandCollector.on('collect', (msg => {
		const command = msg.content.toLowerCase();
		switch (command) {
			case 'endtrivia':
				msg.reply('Game ending after next question!');
				endGame();
				break;
			case 'playerlb':
				msg.reply({
					embeds: [PlayerLeaderboardEmbed(players)]
				});
				break;
		}
	}));

	while (questions.length && !ended) {
		const nextQuestion = questions.shift();
		const questionEmbed = QuestionEmbed(set, questionNumber, nextQuestion);
		const answered = new Map();
		const answers = [0, 0, 0, 0];
		const confirmations = [];

		const optionBars = [];
		nextQuestion.options.forEach((e, i) => {
			// Builds answer message component buttons
			const actionBar = new ActionRowBuilder();

			actionBar.setComponents(
				new ButtonBuilder()
					.setCustomId((i + 1).toString())
					.setLabel(e)
					.setEmoji(choiceEmojis[i])
					.setStyle(ButtonStyle.Secondary));

			optionBars.push(actionBar);
		})

		try {
			const msg = await channel.send({
				embeds: [questionEmbed.setFooter({ text: `${time} seconds | 0 responses` })],
				components: optionBars
			});

			const startTime = Date.now();

			try {
				updateEmbed(msg, questionEmbed, time, answered, players);
			} catch (err) {
				console.error(err);
			}

			// Collects answers from action bar
			const answerCollector = msg.createMessageComponentCollector({
				filter: (buttonInteraction) => players.has(buttonInteraction.user.id) && !answered.has(buttonInteraction.user.id),
				componentType: ComponentType.Button,
				max: players.size,
				time: ms
			});

			// Handles answers
			answerCollector.on('collect', async (buttonInteraction) => {
				const answerTime = Date.now() - startTime;
				const points = getPoints(answerTime, time);
				const player = buttonInteraction.user.id;
				const ansNum = parseInt(buttonInteraction.customId);
				const choice = choiceEmojis[ansNum - 1];

				answers[ansNum - 1]++;

				if (answerTime <= ms) {
					if (nextQuestion.answer.includes(ansNum)) {
						answered.set(player, { buttonInteraction, points, choice });
						players.set(player, players.get(player) + points);
					} else {
						answered.set(player, { buttonInteraction, points: 0, choice });
					}

					// Provides player feedback upon interaction handling.
					confirmations.push(
						buttonInteraction.reply({
							content: `Locked in your answer for ${choice}!`,
							ephemeral: true
						})
					);
				} else {
					buttonInteraction.reply({
						content: `Aww! Seems like you just missed the question!`,
						ephemeral: true
					});
				}
			});

			// Waits for all players to answer or a time out
			await events.once(answerCollector, 'end');

			// Edits the message to display correct answers
			await msg.edit({
				embeds: [ResultEmbed(set, questionNumber, nextQuestion, answers).setFooter({ text: `Responses: ${answered.size}` })]
			});

			// Waits until all replies are sent, then provides ephemeral messages for each players' current standing (in case they are not in the top)
			await Promise.all(confirmations);
			const sorted = [...(players.entries())].sort((a, b) => b[1] - a[1]);
			const leaderboard = PlayerLeaderboardEmbed(players);
			const answerText = choiceEmojis
				.filter((_, i) => (
					nextQuestion.answer.includes(i + 1)))
				.join(', ');

			sorted.forEach((e, i) => {
				const player = e[0];
				const score = e[1];

				if (answered.has(player)) {
					const { buttonInteraction, points, choice } = answered.get(player);
					buttonInteraction.followUp({
						embeds: [leaderboard.setFooter({
							text: `Your current placement: ${i + 1}\nPoints: ${score | 0} (+ ${points | 0})\nYour Answer: ${choice} | Correct Answer: ${answerText}`
						})],
						ephemeral: true
					});
				}
			})
		} catch (err) {
			console.error(err);
		}

		// Start a new question in 5 seconds
		await new Promise(r => setTimeout(r, 5_000));
		questionNumber++;
	}

	if (!ended) {
		endGame();
	}

	await channel.send({
		content: '## Game ended! Thanks for playing!',
		embeds: [PlayerLeaderboardEmbed(players)]
	});

	return [...(players.entries())].sort((a, b) => b[1] - a[1]);

	function endGame() {
		ended = true;
		commandCollector.stop();
	}

	// Callback to update the question embed every second
	function updateEmbed(msg, embed, timeLeft, answers, playerList) {
		if (ended) {
			return;
		}

		if (timeLeft > 0 && answers.size < playerList.size) {
			setTimeout(() => { updateEmbed(msg, embed, timeLeft - 1, answers, playerList) }, 1_000);
			try {
				msg.edit({
					embeds: [embed.setFooter({ text: `${timeLeft} seconds | ${answers.size} responses` })],
					components: msg.components
				});
			} catch (error) {
				console.error(error);
			}
		}
	}
}

// Judges the answers for correctness using string similarity.
function getPoints(timeLeft, time) {
	return 1_000 - ((900 / time) * timeLeft / 1_000);
}

module.exports = {
	playGame: playGame
};
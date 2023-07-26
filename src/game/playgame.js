const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { choiceEmojis } = require('../../config.json');
const { PlayerLeaderboardEmbed, ResultEmbed, QuestionEmbed } = require('../helpers/embeds.js');
const events = require('node:events');

// Starts the game passed through.
async function playGame(startChannel, channel, players, set, questions) {
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

	// Plays the game
	while (questions.length && !ended) {
		const nextQuestion = questions.shift();
		const questionEmbed = QuestionEmbed(set, questionNumber, nextQuestion);
		const answered = new Map();
		const answers = [0, 0, 0, 0];

		const optionBars = [];
		nextQuestion.options.forEach((e, i) => {
			const actionBar = new ActionRowBuilder();

			actionBar.setComponents(
				new ButtonBuilder()
					.setCustomId((i + 1).toString())
					.setLabel(e)
					.setEmoji(choiceEmojis[i])
					.setStyle(ButtonStyle.Secondary));

			optionBars.push(actionBar);
		})

		const msg = await channel.send({
			embeds: [questionEmbed.setFooter({ text: `20 seconds | 0 responses` })],
			components: optionBars
		});
		const startTime = Date.now();
		updateEmbed(msg, questionEmbed, 20, answered, players);
		// Collects answers from action bar
		const answerCollector = msg.createMessageComponentCollector({
			filter: (buttonInteraction) => players.has(buttonInteraction.user.id) && !answered.has(buttonInteraction.user.id),
			componentType: ComponentType.Button,
			max: players.size,
			time: 20_000
		});

		// Handles answers
		answerCollector.on('collect', async (buttonInteraction) => {
			const answerTime = Date.now() - startTime;
			const player = buttonInteraction.user.id;
			const ansNum = parseInt(buttonInteraction.customId);

			answered.set(player, buttonInteraction);
			answers[ansNum - 1]++;

			if (answerTime < 20_001) {
				if (nextQuestion.answer.includes(ansNum)) {
					players.set(player, players.get(player) + getPoints(answerTime));
				}
				buttonInteraction.reply({
					content: `Locked in your answer for ${choiceEmojis[ansNum - 1]}!`,
					ephemeral: true
				});
			}
		});

		try {
			await events.once(answerCollector, 'end');
			await msg.edit({
				embeds: [ResultEmbed(set, questionNumber, nextQuestion, answers).setFooter({ text: `Responses: ${answered.size}` })]
			});
			if (questions.length) {
				await channel.send({
					embeds: [PlayerLeaderboardEmbed(players)]
				})
			}
			await new Promise(r => setTimeout(r, 2_000));
			const sorted = [...(players.entries())].sort((a, b) => b[1] - a[1]);

			sorted.forEach((e, i) => {
				const player = e[0];
				const score = e[1];

				if (answered.has(player)) {
					const buttonInteraction = answered.get(player);
					buttonInteraction.followUp({
						content: `Current Placement: ${i + 1}\nPoints: ${score | 0}`,
						ephemeral: true
					});
				}
			})
		} catch (err) {
			console.error(err);
			startChannel.send({
				content: 'Oops, something went wrong!!'
			});
			ended = true;
		}

		// Start a new question in 5 seconds
		await new Promise(r => setTimeout(r, 5_000));
		questionNumber++;
	}

	if (!ended) {
		endGame();
	}

	channel.send({
		content: '## Game Ended!',
		embeds: [PlayerLeaderboardEmbed(players)]
	});

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
			msg.edit({
				embeds: [embed.setFooter({ text: `${timeLeft} seconds | ${answers.size} responses` })],
				components: msg.components
			});
		}
	}
}

// Judges the answers for correctness using string similarity.
function getPoints(timeLeft) {
	return 1000 - (45 * timeLeft / 1_000);
}

module.exports = {
	playGame: playGame
};
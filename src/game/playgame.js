const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { choiceEmojis } = require('../../config.json');
const { PlayerLeaderboardEmbed, ResultEmbed, QuestionEmbed } = require('../helpers/embeds.js');

// Creates an action bar for each # of options.
const optionsBars = [new ActionRowBuilder()];

choiceEmojis.forEach((e, i) => {
	const button = new ButtonBuilder()
		.setCustomId((i + 1).toString())
		.setStyle(ButtonStyle.Secondary)
		.setEmoji(e);

	optionsBars.push(optionsBars[i].addComponents({
		button
	}));
})

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
		console.log(optionsBars[nextQuestion.options.length]);
		// TODO: Add action bar to message
		const msg = await channel.send({
			embeds: [questionEmbed.setFooter({ text: `20 seconds | 0 responses` })],
		});
		const startTime = Date.now();
		const answered = new Map();

		// Collects answers from action bar
		const answerCollector = msg.createMessageComponentCollector({
			filter: (buttonInteraction) => players.has(buttonInteraction.user.id) && !answered.has(buttonInteraction.user.id),
			componentType: ComponentType.Button,
			max: players.size
		});

		// Handles answers
		answerCollector.on('collect', (buttonInteraction) => {
			const answerTime = startTime - Date.now();

			answered.set(buttonInteraction.user.id, answerTime);

			if (answerTime < 20_000) {
				if (nextQuestion.answers.includes(buttonInteraction.customId)) {
					players.get(buttonInteraction.user.id) += getPoints(answerTime);
				}
				buttonInteraction.reply({
					content: `Locked in answer for ${buttonInteraction.emoji}!`,
					ephemeral: true
				});
			}
		});

		// TODO - Add interval of 1s to update function


		// TODO - Complete end event (send a leaderboard embed and update the question with the correct answers (ResultEmbed))
		answerCollector.on('end', (collected) => {

		});

		// Start a new question in 5 seconds
		await new Promise(r => setTimeout(r, 5_000));
		questionNumber++;
	}

	if (!ended) {
		endGame();
	}

	channel.send({
		content: '## Game Ended! Final Standings:',
		embeds: [PlayerLeaderboardEmbed(players)]
	});

	function endGame() {
		ended = true;
		commandCollector.stop();
	}

	// Callback to update the question embed every second
	function updateEmbed(row, msg) {
		// TODO - Complete
		if (!interval) {
			return;
		}

		msg.edit({
			embeds: [QuestionEmbed],
			components: [row]
		});
	}
}

// Judges the answers for correctness using string similarity.
function getPoints(timeLeft) {
	return 1000 - 45 * timeLeft / 1_000;
}

module.exports = {
	playGame: playGame
};
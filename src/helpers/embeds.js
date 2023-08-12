const { Client, Member, EmbedBuilder, bold, underscore, strikethrough, inlineCode, userMention } = require('discord.js');
const { embedColor, choiceEmojis, leaderboardDisplay } = require('../../config.json');
const info = require('./info.json');

/**
 * Generates an embed summarizing the result of a question set add operation.
 *
 * @param {string} title The title of the question set.
 * @param {string} description The description of the question set.
 * @param {Member} author The user who submitted the question set.
 * @param {Array} questionSet The question set.
 *
 * @return {EmbedBuilder} The embed to be displayed.
*/
function AddSummaryEmbed(title, description, author, questionSet) {
	return new EmbedBuilder()
		.setColor(embedColor)
		.setTitle(title)
		.setDescription(description)
		.setAuthor({
			name: author.displayName,
			iconURL: author.displayAvatarURL()
		})
		.setFields(
			{ name: bold(underscore('Questions Added')), value: questionSet.length.toString() },
			{ name: bold(underscore('First Question')), value: questionSet[0].question },
			{ name: bold(underscore('Last Question')), value: questionSet[questionSet.length - 1].question },
		)
		.setTimestamp();
}

/**
 * Generates an embed that provides information about the game or a specific command.
 *
 * @param {string} command The command to provide info on. If undefined, provides general information.
 *
 * @return {EmbedBuilder} The embed to be displayed.
*/
function InfoEmbed(command) {
	const title = command ? inlineCode(`/${command}`) : bold('General Information');
	const commandInfo = command ? info[command] : info['general'];

	/* Command Info structure:
	 * {
	 *	 description: "...",
	 *   fields: [
	 * 		{
	 * 			name: "...",
	 * 			value: "..."
	 * 		}
	 * 		, ...
	 *   ]
	 * }
	*/
	return new EmbedBuilder()
		.setColor(embedColor)
		.setTitle(title)
		.setDescription(commandInfo['description'])
		.addFields(commandInfo['fields']);
}

/**
 * Generates an embed with current point standings for each player.
 *
 * @param {Map<number, number>} players The list of all player objects.
 *
 * @return {EmbedBuilder} The embed to be displayed.
*/
function PlayerLeaderboardEmbed(players) {
	const msg = new EmbedBuilder()
		.setColor(embedColor)
		.setTitle('🏆 Standings 🏆');

	let description = '';
	const sorted = [...(players.entries())].sort((a, b) => b[1] - a[1]).slice(0, leaderboardDisplay);
	sorted.forEach((player) => {
		description += `${inlineCode(`${player[1] | 0} points`)} - ${userMention(player[0])}\n`;
	});
	return msg.setDescription(description);
}

/**
 * Generates an embed displaying the current question of the game.
 *
 * @param {string} questionSet The name of the current question set.
 * @param {number} num The current question number.
 * @param {Object} questionObject The question being asked.
 * @param {number} time The time in seconds left.
 * @param {number} answers The number of people who have answered the question.
 *
 * @return {EmbedBuilder} The embed to be displayed.
*/
function QuestionEmbed(questionSet, num, questionObject) {
	const { question, img } = questionObject;

	const msg = new EmbedBuilder()
		.setColor(embedColor)
		.setTitle(`${questionSet} ※ Question ${num}`)
		.setDescription(question);

	if (img) {
		msg.setImage(img);
	}

	return msg;
}

/**
 * Generates an embed displaying the outcome of a trivia question.
 *
 * @param {string} questionSet The name of the current question set.
 * @param {number} num The current question number.
 * @param {Object} questionObject The question being asked.
 * @param {Array<Number>} tally An array of the number of responses for each option
 *
 * @return {EmbedBuilder} The embed to be displayed.
*/
function ResultEmbed(questionSet, num, questionObject, tally) {
	const { question, options, answer, img } = questionObject;

	const msg = new EmbedBuilder()
		.setColor(embedColor)
		.setTitle(`${questionSet} ※ Question ${num}`)
		.setDescription(question);

	options.forEach((option, i) => {
		msg.addFields({
			name: `${choiceEmojis[i]} (${tally[i]} ${tally[i] === 1 ? 'Response' : 'Responses'})`,
			value: answer.includes(i + 1) ? bold(option) : strikethrough(option)
		})
	});

	if (img) {
		msg.setImage(img);
	}

	return msg;
}

/**
 * Generates an embed with team and question set information on game start.
 *
 * @param {string} questionSet The title of the question set being played.
 * @param {string} description The description of the question set being played.
 * @param {Map<number, number>} players The current state of players.
 *
 * @return {EmbedBuilder} The embed to be displayed.
*/

function StartEmbed(questionSet, description, players) {
	const msg = new EmbedBuilder()
		.setColor(embedColor)
		.setTitle(`${questionSet} ※ Press the button to join!`)
		.setDescription(description)
		.setTimestamp();

	let playerStrings;

	const playerIds = Array.from(players.keys());
	playerStrings = playerIds.slice(Math.max(0, playerIds.length - 10), playerIds.length).map(player => (
		userMention(player)
	));

	msg.setFields(
		{
			name: 'Players',
			value: playerIds.length ? `${playerStrings.reverse().join(' ')} ${playerIds.length > 10 ? `+ ${players.size - 10} more` : ''}` : 'None yet! Be the first to join!'
		}
	);
	return msg;
}

module.exports = {
	AddSummaryEmbed, InfoEmbed, PlayerLeaderboardEmbed, ResultEmbed, QuestionEmbed, StartEmbed
};
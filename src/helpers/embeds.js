const { Client, Member, EmbedBuilder, bold, underscore, inlineCode, userMention } = require('discord.js');
const { embedColor, choiceEmojis } = require('../../config.json');
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
 * Generates an embed that announces a particular player has buzzed in.
 *
 * @param {string} playerName The name of the player who buzzed in.
 * @param {number} team The team of the player belongs to.
 * @param {Client} client The Discord bot client object.
 * @param {number} numAnswers The number of answers required for the question set.
 *
 * @return {EmbedBuilder} The embed to be displayed.
*/
function BuzzEmbed(playerName, team, client, numAnswers) {
	const emoji = client.emojis.cache.get(team);
	const msg = new EmbedBuilder()
		.setColor(embedColor)
		.setTitle(`${emoji} ${playerName} has buzzed in! ${emoji}`)
		.setDescription(`You have ${10 * numAnswers} seconds to answer!`);

	return msg;
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
 * Generates an embed listing question sets that match the query.
 *
 * @param {number} page The page of the query requested.
 * @param {number} maxPage The highest page of the query.
 * @param {string} keyword The string query the user submitted.
 * @param {Array} questionSets The list of question sets of the query.
 *
 * @return {EmbedBuilder} The embed to be displayed.
*/
function ListEmbed(page, maxPage, keyword, questionSets) {
	const leftIndex = 10 * (page - 1);
	const rightIndex = Math.min(10 * page, questionSets.length);
	const slice = questionSets.slice(leftIndex, rightIndex);
	let description = keyword ? underscore(`Matching query ${bold(keyword)}\n`) : '';

	for (const [title, metadata] of slice) {
		description += `${inlineCode(title)} - <@${metadata.owner}>\n`;
	}

	return new EmbedBuilder()
		.setColor(embedColor)
		.setTitle(`Page ${page} of ${maxPage}`)
		.setDescription(description)
		.setFooter({ text: `Question Sets ${leftIndex + 1} to ${rightIndex}` });

}

/**
 * Generates an embed with current point standings for each player.
 *
 * @param {Map<number, Object>} players The list of all player objects.
 *
 * @return {EmbedBuilder} The embed to be displayed.
*/
function PlayerLeaderboardEmbed(players) {
	const msg = new EmbedBuilder()
		.setColor(embedColor)
		.setTitle('🏆 Player Standings 🏆');

	let description = '';
	const sorted = new Map([...(players.entries())].sort((a, b) => b[1].score - a[1].score));
	sorted.forEach((player) => {
		description += `${inlineCode(`${player.score} points`)} - ${player.name}\n`;
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
function QuestionEmbed(questionSet, num, questionObject, time) {
	const { question, options, img } = questionObject;

	const msg = new EmbedBuilder()
		.setColor(embedColor)
		.setTitle(`❔ ${questionSet} ※ Question ${num} ❔`)
		.setDescription(question);
	
	options.forEach((option, i) => {
		msg.addFields({
			name: choiceEmojis[i],
			value: option
		})
	});

	if (img) {
		msg.setImage(question.img);
	}

	return msg;
}
/**
 * Generates an embed listing question set info to a query.
 *
 * @param {string} title The title of the question set requested.
 * @param {number} numQuestions The number of questions of the query.
 * @param {Object} data Query result containing the question set description, owner, and creation date.
 *
 * @return {EmbedBuilder} The embed to be displayed.
*/
function QuestionInfoEmbed(title, numQuestions, { description, owner, timestamp }) {
	return new EmbedBuilder()
		.setColor(embedColor)
		.setTitle(title)
		.setDescription(description)
		.addFields(
			{ name: bold(underscore('Topic Creator')), value: userMention(owner) },
			{ name: bold(underscore('Number of Questions')), value: numQuestions.toString() },
			{ name: bold(underscore('Date Created')), value: time(timestamp) },
		)
		.setTimestamp();
}

/**
 * Generates an embed displaying the outcome of a trivia question.
 *
 * @param {string} questionSet The name of the current question set.
 * @param {number} num The current question number.
 * @param {Object} questionObject The question being asked.
 *
 * @return {EmbedBuilder} The embed to be displayed.
*/
function ResultEmbed(questionSet, num, questionObject) {
	const { question, options, img } = questionObject;

	const msg = new EmbedBuilder()
		.setColor(embedColor)
		.setTitle(`❔ ${questionSet} ※ Question ${num} ❔`)
		.setDescription(question);

	options.forEach((option, i) => {
		msg.addFields({
			name: choiceEmojis[i],
			value: option
		})
	});

	if (img) {
		msg.setImage(question.img);
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
			value: playerIds.length ? `${playerStrings.reverse().join(' ')} ${playerIds.length > 10 ? `+ ${players.length - 10} more` : ''}` : 'None yet! Be the first to join!'
		}
	);
	return msg;
}

module.exports = {
	AddSummaryEmbed, PlayerLeaderboardEmbed, ResultEmbed,
	QuestionEmbed, QuestionInfoEmbed, StartEmbed
};
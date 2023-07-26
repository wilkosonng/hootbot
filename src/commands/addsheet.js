const { SlashCommandBuilder } = require('discord.js');
const validator = require('validator');
const sheets = require('google-spreadsheet');
const { initializeApp } = require('firebase/app');
const { getDatabase } = require('firebase/database');
const { AddSummaryEmbed } = require('../helpers/embeds.js');
const { removeWhiteSpace, uploadSet, deleteSet } = require('../helpers/helpers.js');
require('dotenv').config();

const sheetsRegex = /docs\.google\.com\/spreadsheets(\/u\/\d)?\/d\/(?<id>[\w-]+)\//;
const questionRegex = /^(!!img\[(?<img>https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)\.(png|jpg|jpeg|gif|webp))\])?(?<question>.+)$/i;
const answerRegex = /^(?=(([1-4]){1,4}))1?2?3?4?$/;

const firebaseApp = initializeApp(JSON.parse(process.env.FIREBASE_CREDS));
const database = getDatabase(firebaseApp);

module.exports = {
	data: new SlashCommandBuilder()
		.setName('addsheet')
		.setDescription('Adds a question set from a Google Sheet into the pool.')
		.addStringOption(option =>
			option
				.setName('title')
				.setDescription('The title of your question set')
				.setRequired(true))
		.addStringOption(option =>
			option
				.setName('description')
				.setDescription('Explanation (including special instructions) of the question set')
				.setRequired(true))
		.addStringOption(option =>
			option
				.setName('url')
				.setDescription('Google Sheets URL of the question set')
				.setRequired(true)),

	async execute(interaction, currSets) {
		await interaction.deferReply();

		const title = removeWhiteSpace(interaction.options.getString('title'));
		const description = removeWhiteSpace(interaction.options.getString('description'));
		const url = interaction.options.getString('url');
		const user = interaction.user;
		const questionSet = [];

		// Returns if the title is invalid.
		if (title.length > 60) {
			return interaction.editReply({
				content: 'Invalid title. Please keep titles at most 60 characters with alphanumeric with punctuation and normal spacing!',
			});
		}

		// Checks if title is already taken.
		if (currSets.includes(title)) {
			return interaction.editReply({
				content: 'Title already exists. Please choose a different title!',
			});
		}

		// Returns if the description is invalid.
		if (description.length > 300) {
			return interaction.editReply({
				content: 'Invalid description. Please make sure you are using normal spacing and the description is at most 300 characters!}',
			});
		}

		// Returns if the URL is invalid.
		if (!validator.isURL(url)) {
			return interaction.editReply({
				content: 'Invalid URL. Please check to make sure you submitted a valid URL!',
			});
		}

		const match = url.match(sheetsRegex);

		// Asserts the URL is properly-formatted such that the spreadsheet ID is extractable.
		if (match?.groups?.id == null) {
			return interaction.editReply({
				content: 'Cannot find Spreadsheet ID from URL. Make sure your URL is a valid Google Sheets URL!',
			});
		}

		// Attempts to access the spreadsheet.
		const doc = new sheets.GoogleSpreadsheet(match.groups.id);
		try {
			await doc.useServiceAccountAuth(JSON.parse(process.env.GOOGLE_CREDS));
		} catch (error) {
			console.log(error);
			return interaction.editReply({
				content: 'Could not access spreadsheet (authentication issue).',
			});
		}

		// Attempts to load the info from the spreadsheet.
		try {
			await doc.loadInfo();
		} catch (error) {
			console.log(error);
			return interaction.editReply({
				content: 'Failure to load spreadsheet. Check if your Spreadsheet ID in your Google Sheets URL is valid and that the sheet is public or shared with the bot.',
			});
		}

		const sheet = doc.sheetsByIndex[0];

		// Attempts to load and process the spreadsheet rows.
		try {
			const rows = await sheet.getRows();

			if (rows.length < 1) {
				return interaction.editReply({
					content: 'No questions found!',
				});
			}

			if (rows.length > 2000) {
				return interaction.editReply({
					content: 'Too many questions and answers. Please keep maximum rows to 2000. Split up the question set if necessary.',
				});
			}

			for (const row of rows) {
				const raw = row._rawData;
				const question = raw[0];
				const questionMatch = question.match(questionRegex);

				if (raw.length > 100) {
					return interaction.editReply({
						content: 'Too many answers. Please keep maximum columns to 100.',
					});
				}

				// Asserts the question is properly-formatted.
				if (questionMatch.groups.question == null) {
					return interaction.editReply({
						content: `Failed to add question at row ${row.rowIndex}: invalid question.`,
					});
				}

				if (!raw[5] || !answerRegex.test(raw[5])) {
					return interaction.editReply({
						content: `Incorrect answer format at ${questionMatch.groups.question}`,
					});
				}

				const answers = raw[5].split('').map(answer => (
					parseInt(answer)
				));

				const options = raw.slice(1, 5).filter(a => a).map((option) => (
					removeWhiteSpace(option)
				));
				
				if (options.some(option => (
					option.length > 100
				))) {
					return interaction.editReply({
						content: `Failed to add question ${question}: answer option must be 100 characters or less!`,
					});
				}
				// Asserts sufficient answers exists.
				if (options.length < answers[answers.length - 1]) {
					return interaction.editReply({
						content: `Failed to add question ${question}: impossible answer exists.`,
					});
				}

				// If an answer exists, add the question and answer pair to the question set.
				questionSet.push({
					question: removeWhiteSpace(questionMatch.groups.question),
					options: options,
					answer: answers,
					img: questionMatch.groups.img ?? null
				});
			}
		} catch (error) {
			console.error(error);
			return interaction.editReply({
				content: 'Failure to extract data. Make sure your spreadsheet is formatted correctly.',
			});
		}

		// Attempts to add the trivia to the database.
		if (!(uploadSet(database, questionSet, title, description, user.id))) {
			// Cleans up if the operation was unsuccessful
			deleteSet(database, title);
			return interaction.editReply({
				content: 'Failure to upload question set.'
			});
		}

		// Constructs an embed summary.
		const summary = AddSummaryEmbed(title, description, interaction.member, questionSet);

		interaction.channel.send({
			embeds: [summary],
		});

		return interaction.editReply({
			content: 'Successfully added question set!',
		});
	}
};
const { Client, Events, GatewayIntentBits, Collection } = require('discord.js');
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword, signOut } = require('firebase/auth');
const { getDatabase, onValue, ref } = require('firebase/database');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

const firebaseApp = initializeApp(JSON.parse(process.env.FIREBASE_CREDS));
const database = getDatabase(firebaseApp);
const auth = getAuth(firebaseApp);

let sets = {};

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent
	],
	disableEveryone: true,
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'src', 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
	const command = require(path.join(commandsPath, file));

	if ('data' in command && 'execute' in command) {
		client.commands.set(command.data.name, command);
	}
}

client.once(Events.ClientReady, async clientObject => {
	// Signs into the database.
	await signInWithEmailAndPassword(auth, process.env.FIREBASE_EMAIL, process.env.FIREBASE_PASSWORD)
		.then(() => {
			console.log();
		})
		.catch((error) => {
			console.log(error);
		});

	// Keeps local cache of question set names
	onValue(ref(database, 'questionSets'), (snapshot) => {
		sets = snapshot.val() ?? {};
		console.log('Question Sets Updated:');
		console.log(Object.keys(sets));
	});

	client.user.setActivity('/info to start!');
	console.log(`Bot ready to test knowledge! Username: ${clientObject.user.username}.`);
});

// Command handler
client.on(Events.InteractionCreate, async interaction => {
	try {
		if (interaction.isChatInputCommand()) {
			if (!interaction.channel) {
				return interaction.reply('Invalid channel!');
			}

			const commandName = interaction.commandName;
			const command = interaction.client.commands.get(commandName);

			if (!command) {
				console.error(`No command matching ${commandName} was found.`);
				return;
			}

			try {
				switch (commandName) {
					case 'addsheet':
					case 'removeset':
					case 'setinfo':
					case 'startgame':
						// Passes array of set name cache
						await command.execute(interaction, Object.keys(sets));
						break;
					case 'listsets':
						// Passes array of set metadata cache
						await command.execute(interaction, Object.entries(sets));
						break;
					case 'info':
						// Passes in command list
						await command.execute(interaction, Array.from(client.commands.keys()));
						break;
					default:
						// Otherwise, passes in only interaction
						await command.execute(interaction);
				}
			} catch (error) {
				console.error(error);
				interaction.channel.send('Oopsies, something went wrong! Please contact the bot developer.');
			}
		}
	} catch (error) {
		console.error(error);
		interaction.channel.send('Oopsies, something went wrong! Please contact the bot developer.');
	}
});

// Autocomplete handler
client.on(Events.InteractionCreate, async interaction => {
	try {
		if (!interaction.isAutocomplete()) {
			return;
		}

		const command = interaction.client.commands.get(interaction.commandName);

		if (!command) {
			console.error(`No command matching ${interaction.commandName} was found.`);
			return;
		}

		try {
			if (interaction.commandName === 'info') {
				return await command.autocomplete(interaction, Array.from(client.commands.keys()));
			}
			await command.autocomplete(interaction, Object.keys(sets));
		} catch (error) {
			console.error(error);
		}
	} catch (error) {
		console.error(error);
		interaction.channel.send('Oopsies, something went wrong! Please contact the bot developer.');
	}
});

// Makes sure the bot exits cleanly
process.on('uncaughtException', (error) => {
	console.error(error);
	process.exit(1);
});

process.on('SIGINT', () => {
	process.exit(1);
});

process.on('exit', () => {
	console.log('Exiting Bot');
	signOut(auth);
});

client.login(process.env.HOOT_BOT_TOKEN);
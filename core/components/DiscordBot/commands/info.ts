const modulename = 'DiscordBot:cmd:info';
import { APIEmbedField, CommandInteraction, EmbedBuilder, EmbedData } from 'discord.js';
import TxAdmin from '@core/txAdmin';
import { parsePlayerId } from '@core/extras/helpers';
import { embedder } from '../discordHelpers';
import { findPlayersByIdentifier } from '@core/playerLogic/playerFinder';
import { EvoEnv } from '@core/globalData';
import humanizeDuration from 'humanize-duration';
import consoleFactory from '@extras/console';
const console = consoleFactory(modulename);


//Helpers
const humanizer = humanizeDuration.humanizer({
    round: true,
    units: ['d', 'h', 'm'],
    largest: 2,
    // spacer: '',
    language: 'shortEn',
    languages: {
        shortEn: {
            d: (c) => "day" + (c === 1 ? "" : "s"),
            h: (c) => "hr" + (c === 1 ? "" : "s"),
            m: (c) => "min" + (c === 1 ? "" : "s"),
        },
    },
});

const footer = {
    iconURL: 'https://media.evorative.com/img/logo/main.png',
    text: `Evorative ${EvoEnv.EvorativeVersion}`,
}


/**
 * Handler for /info
 */
export default async (interaction: CommandInteraction, txAdmin: TxAdmin) => {
    const tsToLocaleDate = (ts: number) => {
        return new Date(ts * 1000).toLocaleDateString(
            txAdmin.translator.canonical,
            { dateStyle: 'long' }
        );
    }

    //Check for admininfo & permission
    let includeAdminInfo = false;
    //@ts-ignore: somehow vscode is resolving interaction as CommandInteraction
    const adminInfoFlag = interaction.options.getBoolean('admininfo');
    if (adminInfoFlag) {
        const admin = txAdmin.adminVault.getAdminByProviderUID(interaction.user.id);
        if (!admin) {
            return await interaction.reply(embedder.danger('You cannot use the `admininfo` option if you are not a txAdmin admin.'));
        } else {
            includeAdminInfo = true;
        }
    }

    //Detect search identifier
    let searchId;
    //@ts-ignore: somehow vscode is resolving interaction as CommandInteraction
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'self') {
        const targetId = interaction.member?.user.id;
        if (!targetId) {
            return await interaction.reply(embedder.danger('Could not resolve your Discord ID.'));
        }
        searchId = `discord:${targetId}`;

    } else if (subcommand === 'member') {
        const member = interaction.options.getMember('member');
        if(!member || !('user' in member)){
            return await interaction.reply(embedder.danger(`Failed to resolve member ID.`));
        }
        searchId = `discord:${member.user.id}`;

    } else if (subcommand === 'id') {
        //@ts-ignore: somehow vscode is resolving interaction as CommandInteraction
        const input = interaction.options.getString('id', true).trim();
        if (!input.length) {
            return await interaction.reply(embedder.danger('Invalid identifier.'));
        }

        const { isIdValid, idType, idValue, idlowerCased } = parsePlayerId(input);
        if (!isIdValid || !idType || !idValue || !idlowerCased) {
            return await interaction.reply(embedder.danger(`The provided identifier (\`${input}\`) does not seem to be valid.`));
        }
        searchId = idlowerCased;

    } else {
        throw new Error(`Subcommand ${subcommand} not found.`);
    }

    //Searching for players
    const players = findPlayersByIdentifier(searchId);
    if (!players.length) {
        return await interaction.reply(embedder.warning(`Identifier (\`${searchId}\`) does not seem to be associated to any player in the txAdmin Database.`));
    } else if (players.length > 10) {
        return await interaction.reply(embedder.warning(`The identifier (\`${searchId}\`) is associated with more than 10 players, please use the txAdmin Web Panel to search for it.`));
    }

    //Format players
    const embeds = [];
    for (const player of players) {
        const dbData = player.getDbData();
        if (!dbData) continue;

        //Basic data
        const bodyText: Record<string, string> = {
            'Play time': humanizer(dbData.playTime * 60 * 1000),
            'Join date': tsToLocaleDate(dbData.tsJoined),
            'Last connection': tsToLocaleDate(dbData.tsLastConnection),
            'Whitelisted': (dbData.tsWhitelisted)
                ? tsToLocaleDate(dbData.tsWhitelisted)
                : 'not yet',
        };

        //If admin query
        let fields: APIEmbedField[] | undefined;
        if (includeAdminInfo) {
            //Counting bans/warns
            const actionHistory = player.getHistory();
            const actionCount = { ban: 0, warn: 0 };
            for (const log of actionHistory) {
                actionCount[log.type]++;
            }
            const banText = (actionCount.ban === 1) ? '1 ban' : `${actionCount.ban} bans`;
            const warnText = (actionCount.warn === 1) ? '1 warn' : `${actionCount.warn} warns`;
            bodyText['Log'] = `${banText}, ${warnText}`;

            //Filling notes + identifiers
            const notesText = (dbData.notes) ? dbData.notes.text : 'nothing here';
            const idsText = (dbData.ids.length) ? dbData.ids.join('\n') : 'nothing here';
            fields = [
                {
                    name: '• Notes:',
                    value: `\`\`\`${notesText}\`\`\``
                },
                {
                    name: '• Identifiers:',
                    value: `\`\`\`${idsText}\`\`\``
                },
            ];

        }

        //Preparing embed
        const description = Object.entries(bodyText)
            .map(([label, value]) => `**• ${label}:** \`${value}\``)
            .join('\n')
        const embedData: EmbedData = {
            title: player.displayName,
            fields,
            description,
            footer,
        };
        embeds.push(new EmbedBuilder(embedData).setColor('#4262e2'));
    }

    //Send embeds :)
    return await interaction.reply({ embeds });
}

const modulename = 'DiscordBot:cmd:status';
import humanizeDuration from 'humanize-duration';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, ChatInputCommandInteraction, ColorResolvable, EmbedBuilder } from 'discord.js';
import { EvoEnv } from '@core/globalData';
import TxAdmin from '@core/txAdmin';
import { cloneDeep } from 'lodash-es';
import { embedder, ensurePermission, isValidButtonEmoji, isValidEmbedUrl, logDiscordAdminAction } from '../discordHelpers';
import consoleFactory from '@extras/console';
const console = consoleFactory(modulename);

//Humanizer options
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

const isValidButtonConfig = (btn: any) => {
    const btnType = typeof btn;
    return (
        btn !== null && btnType === 'object'
        && typeof btn.label === 'string'
        && btn.label.length
        && typeof btn.url === 'string'
        // && btn.url.length //let the function handle it
        && (typeof btn.emoji === 'string' || btn.emoji === undefined)
    );
}

const validUrlMessage = `Every URL must start with one of (\`http://\`, \`https://\`, \`discord://\`).
URLs cannot be empty, if you do not want a URL then remove the URL line.`;

const validEmojiMessage = `All emojis must be one of:
- UTF-8 emoji ('😄')
- Valid emoji ID ('1062339910654246964')
- Discord custom emoji (\`<:name:id>\` or \`<a:name:id>\`).
To get the full emoji code, insert it into discord, and add \`\\\` before it then send the message`


export const generateStatusMessage = (
    txAdmin: TxAdmin,
    rawEmbedJson: string = txAdmin.discordBot.config.embedJson,
    rawEmbedConfigJson: string = txAdmin.discordBot.config.embedConfigJson
) => {
    //Parsing decoded JSONs
    let embedJson;
    try {
        embedJson = JSON.parse(rawEmbedJson);
        if (!(embedJson instanceof Object)) throw new Error(`not an Object`);
    } catch (error) {
        throw new Error(`Embed JSON Error: ${(error as Error).message}`);
    }

    let embedConfigJson;
    try {
        embedConfigJson = JSON.parse(rawEmbedConfigJson);
        if (!(embedConfigJson instanceof Object)) throw new Error(`not an Object`);
    } catch (error) {
        throw new Error(`Embed Config JSON Error: ${(error as Error).message}`);
    }

    //Prepare placeholders
    //NOTE: serverCfxId can be undefined, breaking the URLs, but there is no easy clean way to deal with this issue
    const serverCfxId = txAdmin.persistentCache.get('fxsRuntime:cfxId');
    const placeholders = {
        serverName: txAdmin.globalConfig.serverName,
        statusString: 'Unknown',
        statusColor: '#4C3539',
        serverCfxId,
        serverBrowserUrl: `https://servers.fivem.net/servers/detail/${serverCfxId}`,
        serverJoinUrl: `https://cfx.re/join/${serverCfxId}`,
        serverMaxClients: txAdmin.persistentCache.get('fxsRuntime:maxClients') ?? 'unknown',
        serverClients: txAdmin.playerlistManager.onlineCount,
        nextScheduledRestart: 'unknown',
        uptime: (txAdmin.healthMonitor.currentStatus === 'ONLINE')
            ? humanizer(txAdmin.fxRunner.getUptime() * 1000)
            : '--',
    }

    //Prepare scheduler placeholder
    const schedule = txAdmin.scheduler.getStatus();
    if (typeof schedule.nextRelativeMs !== 'number') {
        placeholders.nextScheduledRestart = 'not scheduled';
    } else if (schedule.nextSkip) {
        placeholders.nextScheduledRestart = 'skipped';
    } else {
        const tempFlag = (schedule.nextIsTemp) ? '(tmp)' : '';
        const relativeTime = humanizer(schedule.nextRelativeMs);
        const isLessThanMinute = schedule.nextRelativeMs < 60_000;
        if (isLessThanMinute) {
            placeholders.nextScheduledRestart = `right now ${tempFlag}`;
        } else {
            placeholders.nextScheduledRestart = `in ${relativeTime} ${tempFlag}`;
        }
    }

    //Prepare status placeholders
    if (txAdmin.healthMonitor.currentStatus === 'ONLINE') {
        placeholders.statusString = embedConfigJson?.onlineString ?? '🟢 Online';
        placeholders.statusColor = embedConfigJson?.onlineColor ?? "#0BA70B";
    } else if (txAdmin.healthMonitor.currentStatus === 'PARTIAL') {
        placeholders.statusString = embedConfigJson?.partialString ?? '🟡 Partial';
        placeholders.statusColor = embedConfigJson?.partialColor ?? "#FFF100";
    } else if (txAdmin.healthMonitor.currentStatus === 'OFFLINE') {
        placeholders.statusString = embedConfigJson?.offlineString ?? '🔴 Offline';
        placeholders.statusColor = embedConfigJson?.offlineColor ?? "#A70B28";
    }

    //Processing embed
    function replacePlaceholders(inputString: string) {
        Object.entries(placeholders).forEach(([key, value]) => {
            inputString = inputString.replaceAll(`{{${key}}}`, String(value));
        });
        return inputString;
    }
    function processValue(inputValue: any): any {
        if (typeof inputValue === 'string') {
            return replacePlaceholders(inputValue);
        } else if (Array.isArray(inputValue)) {
            return inputValue.map((arrValue) => processValue(arrValue));
        } else if (inputValue !== null && typeof inputValue === 'object') {
            return processObject(inputValue);
        } else {
            return inputValue;
        }
    }
    function processObject(inputData: object) {
        const input = cloneDeep(inputData);
        const out: any = {};
        for (const [key, value] of Object.entries(input)) {
            const processed = processValue(value);
            if (key === 'url' && !isValidEmbedUrl(processed)) {
                const messageHead = processed.length
                    ? `Invalid URL \`${processed}\`.`
                    : `Empty URL.`;
                const badPlaceholderMessage = processed.startsWith('{{')
                    ? 'Your URL starts with `{{`, try removing it.'
                    : '';
                throw new Error([
                    messageHead,
                    validUrlMessage,
                    badPlaceholderMessage
                ].join('\n'));
            }
            out[key] = processed;
        }
        return out;
    }
    const processedEmbedData = processObject(embedJson);

    //Attempting to instantiate embed class
    let embed;
    try {
        embed = new EmbedBuilder(processedEmbedData);
        embed.setColor(placeholders.statusColor as ColorResolvable);
        embed.setTimestamp();
        embed.setFooter({
            iconURL: 'https://media.evorative.com/img/logo/main.png',
            text: `Evorative ${EvoEnv.EvorativeVersion} • Updated every minute`,

        });
    } catch (error) {
        throw new Error(`**Embed Class Error:** ${(error as Error).message}`);
    }

    //Attempting to instantiate buttons
    let buttonsRow: ActionRowBuilder<ButtonBuilder> | undefined;
    try {
        if (Array.isArray(embedConfigJson?.buttons) && embedConfigJson.buttons.length) {
            if (embedConfigJson.buttons.length > 5) {
                throw new Error(`Over limit of 5 buttons.`);
            }
            buttonsRow = new ActionRowBuilder<ButtonBuilder>();
            for (const cfgButton of embedConfigJson.buttons) {
                if (!isValidButtonConfig(cfgButton)) {
                    throw new Error(`Invalid button in Discord Status Embed Config.
                    All buttons must have:
                    - Label: string, not empty
                    - URL: string, not empty, valid URL`);
                }
                const processedUrl = processValue(cfgButton.url);
                if (!isValidEmbedUrl(processedUrl)) {
                    const messageHead = processedUrl.length
                        ? `Invalid URL \`${processedUrl}\``
                        : `Empty URL`;
                    const badPlaceholderMessage = processedUrl.startsWith('{{')
                        ? 'Your URL starts with `{{`, try removing it.'
                        : '';
                    throw new Error([
                        `${messageHead} for button \`${cfgButton.label}\`.`,
                        validUrlMessage,
                        badPlaceholderMessage
                    ].join('\n'));
                }
                const btn = new ButtonBuilder({
                    style: ButtonStyle.Link,
                    label: processValue(cfgButton.label),
                    url: processedUrl,
                });
                if (cfgButton.emoji !== undefined) {
                    if (!isValidButtonEmoji(cfgButton.emoji)) {
                        throw new Error(`Invalid emoji for button \`${cfgButton.label}\`.\n${validEmojiMessage}`);
                    }
                    btn.setEmoji(cfgButton.emoji);
                }
                buttonsRow.addComponents(btn);
            }
        }
    } catch (error) {
        throw new Error(`**Embed Buttons Error:** ${(error as Error).message}`);
    }

    return {
        embeds: [embed],
        components: buttonsRow ? [buttonsRow] : undefined,
    };
}

export const removeOldEmbed = async (interaction: ChatInputCommandInteraction, txAdmin: TxAdmin) => {
    const oldChannelId = txAdmin.persistentCache.get('discord:status:channelId');
    const oldMessageId = txAdmin.persistentCache.get('discord:status:messageId');
    if (typeof oldChannelId === 'string' && typeof oldMessageId === 'string') {
        const oldChannel = await interaction.client.channels.fetch(oldChannelId);
        if (oldChannel?.type === ChannelType.GuildText || oldChannel?.type === ChannelType.GuildAnnouncement) {
            await oldChannel.messages.delete(oldMessageId);
        } else {
            throw new Error(`oldChannel is not a guild text or announcement channel`);
        }
    } else {
        throw new Error(`no old message id saved, maybe was never sent, maybe it was removed`);
    }
}

export default async (interaction: ChatInputCommandInteraction, txAdmin: TxAdmin) => {
    //Check permissions
    const adminName = await ensurePermission(interaction, txAdmin, 'settings.write');
    if (typeof adminName !== 'string') return;

    //Attempt to remove old message
    const isRemoveOnly = (interaction.options.getSubcommand() === 'remove');
    try {
        await removeOldEmbed(interaction, txAdmin);
        txAdmin.persistentCache.delete('discord:status:channelId');
        txAdmin.persistentCache.delete('discord:status:messageId');
        if (isRemoveOnly) {
            const msg = `Old status embed removed.`;
            logDiscordAdminAction(txAdmin, adminName, msg);
            return await interaction.reply(embedder.success(msg, true));
        }
    } catch (error) {
        if (isRemoveOnly) {
            return await interaction.reply(
                embedder.warning(`**Failed to remove old status embed:**\n${(error as Error).message}`, true)
            );
        }
    }

    //Generate new message
    let newStatusMessage;
    try {
        newStatusMessage = generateStatusMessage(txAdmin);
    } catch (error) {
        return await interaction.reply(
            embedder.warning(`**Failed to generate new embed:**\n${(error as Error).message}`, true)
        );
    }

    //Attempt to send new message
    try {
        if (interaction.channel?.type !== ChannelType.GuildText && interaction.channel?.type !== ChannelType.GuildAnnouncement) {
            throw new Error(`channel type not supported`);
        }
        const placeholderEmbed = new EmbedBuilder({
            description: '_placeholder message, attempting to edit with embed..._\n**Note:** If you are seeing this message, it probably means that something was wrong with the configured Embed JSONs and Discord\'s API rejected the request to replace this placeholder.'
        })
        const newMessage = await interaction.channel.send({ embeds: [placeholderEmbed] });
        await newMessage.edit(newStatusMessage);
        txAdmin.persistentCache.set('discord:status:channelId', interaction.channelId);
        txAdmin.persistentCache.set('discord:status:messageId', newMessage.id);
    } catch (error) {
        let msg: string;
        if((error as any).code === 50013){
            msg = `This bot does not have permission to send messages in this channel.
            Please edit the channel and give this bot the "Send Messages" permission.`
        }else{
            msg = (error as Error).message;
        }
        return await interaction.reply(
            embedder.warning(`**Failed to send new embed:**\n${msg}`, true)
        );
    }

    const msg = `Status embed saved.`;
    logDiscordAdminAction(txAdmin, adminName, msg);
    return await interaction.reply(embedder.success(msg, true));
}

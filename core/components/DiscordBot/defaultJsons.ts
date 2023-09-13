export const defaultEmbedJson = JSON.stringify({
    "title": "{{serverName}}",
    "url": "{{serverBrowserUrl}}",
    "description": "You can configure this embed in `txAdmin > Settings > Discord Bot`, and edit everything from it (except footer).",
    "fields": [
        {
            "name": "> STATUS",
            "value": "```\n{{statusString}}\n```",
            "inline": true
        },
        {
            "name": "> PLAYERS",
            "value": "```\n{{serverClients}}/{{serverMaxClients}}\n```",
            "inline": true
        },
        {
            "name": "> F8 CONNECT COMMAND",
            "value": "```\nconnect 123.123.123.123\n```"
        },
        {
            "name": "> NEXT RESTART",
            "value": "```\n{{nextScheduledRestart}}\n```",
            "inline": true
        },
        {
            "name": "> UPTIME",
            "value": "```\n{{uptime}}\n```",
            "inline": true
        }
    ],
    "image": {
        "url": "https://i.imgur.com/ZZRp4pj.png"
    },
    "thumbnail": {
        "url": "https://i.imgur.com/9i9lvOp.png"
    }
}, null, 2);

export const defaultEmbedConfigJson = JSON.stringify({
    "onlineString": "🟢 Online",
    "onlineColor": "#0BA70B",
    "partialString": "🟡 Partial",
    "partialColor": "#FFF100",
    "offlineString": "🔴 Offline",
    "offlineColor": "#A70B28",
    "buttons": [
        {
          "emoji": "<:banshield:1151323684800311388>",
          "label": "Install Launcher",
          "url": "https://evoraguard.evorative.com/installer"
        },
        {
          "emoji": "<:Evorative_medium:1151323146369122414>",
          "label": "Evorative Discord",
          "url": "https://discord.evorative.com"
        },
        {
          "emoji": "<:icons8website100:1151323665724604466>",
          "label": "Evorative Website",
          "url": "https://evorative.com"
        }
    ]
}, null, 2);

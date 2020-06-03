const { MessageEmbed } = require('discord.js');
const { DateTime } = require('luxon');

const Guild = require('../structures/models/Guild');
const Logger = require('../utils/Logger.js');
const getCommand = require('../utils/getThing.js');

module.exports = async (client, message) => {

    if (message.author.bot || message.system) return;

    if (!client.settings.find(g => g.id == message.guild.id)) {
        await Guild.create({ id: message.guild.id })
        client.settings = await Guild.find({});
    }

    const guildSettings = client.settings.find(g => g.id == message.guild.id);

    if (guildSettings.giveRole.isEnabled &&
        guildSettings.giveRole.triggerWords.length !== 0) {

        let systemTrigger = new RegExp(`^(?:${guildSettings.giveRole.triggerWords.join('|')})$`, "gi")

        if (systemTrigger.test(message.content)) {

            if (guildSettings.giveRole.require.channels && guildSettings.giveRole.require.channels.length !== 0 &&
                guildSettings.giveRole.require.channels.includes(message.channel.id) &&
                guildSettings.giveRole.require.roles && guildSettings.giveRole.require.roles.length !== 0 &&
                message.member.roles.cache.some(role => guildSettings.giveRole.require.roles.includes(role.id)) &&

                guildSettings.giveRole.banned.channels && guildSettings.giveRole.banned.channels.length !== 0 &&
                !guildSettings.giveRole.banned.channels.includes(message.channel.id) &&
                guildSettings.giveRole.banned.roles && guildSettings.giveRole.banned.roles.length !== 0 &&
                message.member.roles.cache.some(role => !guildSettings.giveRole.banned.roles.includes(role.id))) {

                require('../cmds/giveRoles/createRequest').run(client, message, guildSettings);

                return Logger.log(`${
                    Logger.setColor('magenta', message.author.tag)} запросил роль на сервере ${
                    Logger.setColor('teal', message.guild.name)
                    }.`);

            } else {
                return Logger.log(`${
                    Logger.setColor('magenta', message.author.tag)} попытался запросить роль на сервере ${
                    Logger.setColor('teal', message.guild.name)
                    }. Ошибка: ${
                    Logger.setColor('gold', `Не пройдена проверка на необходимый канал/роль`)}`);
            }
        }
    }

    const thisPrefix = await guildSettings.common.prefix || '/';
    if (!message.content.startsWith(thisPrefix)) return;

    message.content = message.content.replace(/@everyone/g, '**everyone**');
    message.content = message.content.replace(/@here/g, '**here**');

    const messageToString = message.content.length > 1024 ? message.content.substring(0, 1021) + '...' : message.content;
    const args = message.content.slice(thisPrefix.length).trim().split(/ +/g);

    const cmd = await getCommand('command', args[0].toLowerCase().normalize());
    args.shift();

    if (cmd && !!thisPrefix) {
        if (!client.isDev(message.author.id) && (['dev'].includes(cmd.category) || cmd.devOnly)) {

            message.channel.send(new MessageEmbed()
                .setColor('#ecc333')
                .setTitle(`**У вас нет прав на использование этой команды**`)
            );
            return Logger.log(`${
                Logger.setColor('magenta', message.author.tag)} попытался использовать команду для разработчиков ${
                Logger.setColor('gold', cmd.name)} на сервере ${
                Logger.setColor('teal', message.guild.name)
                }.`);
        }

        if (!message.guild) {
            Logger.log(`${
                Logger.setColor('magenta', message.author.tag)} использовал команду ${
                Logger.setColor('gold', cmd.name)} в ЛС.`
            );
            if (cmd.guildOnly) {
                message.channel.send(new MessageEmbed()
                    .setColor('#ecc333')
                    .setTitle(`**Эта команда доступна только на сервере**`));
                return Logger.log(`${
                    Logger.setColor('magenta', message.author.tag)} использовал команду ${
                    Logger.setColor('gold', cmd.name)} которая доступна только на сервере, но в ЛС`
                );
            }
        } else {
            Logger.log(`${
                Logger.setColor('magenta', message.author.tag)} использовал команду ${
                Logger.setColor('gold', cmd.name)} на сервере ${
                Logger.setColor('teal', message.guild.name)}.`
            );

            const verified = verifyPerms(cmd);
            if (verified.client.length > 0) return message.channel.send(missingPermission(verified.client, true));
            if (verified.user.length > 0) return message.channel.send(missingPermission(verified.user));

            if (cmd.nsfw && !message.channel.nsfw) {
                return message.channel.send(new MessageEmbed()
                    .setColor('#ff3333')
                    .setTitle('**🔞 | Ошибка**')
                    .setDescription('**Эта команда доступна только в NSFW каналах**'));
            }
        }

        return cmd.run(client, message, args).catch((warning) => {
            Logger.warn(`Произошла ошибка в коде команды ${
                Logger.setColor('gold', cmd.name)}. \nВремя: ${
                Logger.setColor('yellow', DateTime.local().toFormat('TT'))}${
                Logger.setColor('red', '\nОшибка: ' + warning.stack)}`
            );


            if (client.isDev(message.author.id)) {
                return message.channel.send(new MessageEmbed()
                    .setColor('#ff3333')
                    .setDescription('**Произошла ошибка в коде команды: **' + cmd.name + '**')
                    .addField('**Дебаг**', `**\nАвтор: ${message.author} (\`${message.author.id}\`)\n\nНа сервере: **${message.guild.name}** (\`${message.guild.id}\`)\n\nВ канале: ${message.channel} (\`${message.channel.id})\`**`)
                    .addField('**Ошибка**', warning.stack.length > 1024 ? warning.stack.substring(0, 1021) + '...' : warning.stack)
                    .addField('**Сообщение:**', messageToString));
            }
        });
    }

    function verifyPerms(command) {
        const clientMissingPermissions = [];
        const userMissingPermissions = [];
        if (!message.guild.me.hasPermission('ADMINISTRATOR')) {
            if (command.hasOwnProperty('clientPermissions')) {
                command.clientPermissions.forEach(permission => {
                    if (!message.guild.me.hasPermission(permission, true, false, false)) clientMissingPermissions.push(permission);
                });
            }
            if (command.hasOwnProperty('userPermissions')) {
                command.userPermissions.forEach(permission => {
                    if (!message.member.hasPermission(permission, true, false, false)) userMissingPermissions.push(permission);
                });
            }
        }

        return {
            client: clientMissingPermissions,
            user: userMissingPermissions
        };
    }

    function missingPermission(permissions, client = false) {
        return new MessageEmbed()
            .setColor('#ecc333')
            .setTitle(client ? `**У бота не хватает прав**` : `**У вас не хватает прав**`)
            .setDescription(`**Необходимо: ${permissions}**`);
    }
}

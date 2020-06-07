const { MessageEmbed } = require('discord.js'); // Для отправки сообщений типа ембед
const RoleRequests = require('../../structures/models/RoleRequests'); // Для логирования запросов

exports.run = async (client, message, guildSettings) => {

    // TODO: Добавить в БД возможность удалять сообщения автора, 
    // бота по интервалу или вообще не отвечать

    // TODO: Добавить для премиум серверов (Аризона) поиск пользователя на сайте проекта

    // Проверяем, разрешено ли использование системы в данном канале
    if (guildSettings.giveRole.require.channels && guildSettings.giveRole.require.channels.length !== 0 &&
        guildSettings.giveRole.require.channels.includes(message.channel.id) &&
        guildSettings.giveRole.banned.channels && guildSettings.giveRole.banned.channels.length !== 0 &&
        !guildSettings.giveRole.banned.channels.includes(message.channel.id)) {

        // Проверяем, разрешено ли пользователю использовать систему
        if (guildSettings.giveRole.require.roles && guildSettings.giveRole.require.roles.length !== 0 &&
            message.member.roles.cache.some(role => guildSettings.giveRole.require.roles.includes(role.id)) &&
            guildSettings.giveRole.banned.roles && guildSettings.giveRole.banned.roles.length !== 0 &&
            message.member.roles.cache.some(role => !guildSettings.giveRole.banned.roles.includes(role.id))) {

            // Проверяем форму ника. Создаем регулярное выражение по тому, что указано в БД
            let nickRegex = new RegExp(guildSettings.giveRole.nameRegex, "i");

            // Если ник не подходит по форме, отправить ошибку
            if (!nickRegex || !nickRegex.test(message.member.displayName)) {
                message.react(`⚠️`);
                return message.channel.send(new MessageEmbed()
                    .setColor('#ffde21')
                    .setTitle("**⚠️ | Произошла ошибка**")
                    .setDescription("**Ваш ник не соответствует форме**"))
            }

            // Создаем массив с информацией по нику пользователя
            let nickInfo = message.member.displayName.match(nickRegex);
            nickInfo[3] = nickInfo[3] + '_' + nickInfo[4];
            nickInfo.splice(-1, 1);

            // Если в БД уже есть активный запрос от данного человека, отправить ошибку
            if (await RoleRequests.findOne({ "user.id": message.member.id, "guildId": message.guild.id, "status": "poll" })) {
                message.react(`⏱️`);
                return message.channel.send(new MessageEmbed()
                    .setColor('#59afff')
                    .setTitle("**⏱️ | Произошла ошибка**")
                    .setDescription("**Вы уже отправляли запрос. Ожидайте рассмотрения заявки модераторами**"))
            }

            // Ищем тег пользователя в базе данных
            let tagInfo = guildSettings.giveRole.tags ?
                guildSettings.giveRole.tags.find(tag => tag.names.includes(nickInfo[1])) : null;


            // Если указанного тега нет, отправить сообщение об ошибке
            if (!tagInfo) {
                message.react(`🚫`);
                return message.channel.send(new MessageEmbed()
                    .setColor('#ff3333')
                    .setTitle("**🚫 | Произошла ошибка**")
                    .setDescription(`**Тег \`${nickInfo[1].replace(/`/, '')}\` не найден в настройках сервера**`))
            }

            if (!message.guild.roles.cache.some(r => tagInfo.giveRoles.includes(r.id))) {
                message.react(`🚫`);
                return message.channel.send(new MessageEmbed()
                    .setColor('#ff3333')
                    .setTitle("**🚫 | Произошла ошибка**")
                    .setDescription(`**Одна из ролей для выдачи тега \`${nickInfo[1].replace(/`/, '')}\` не найдена на сервере**`))
            }

            // Поиск канала для отправки запроса
            let requestsChannel = message.guild.channels.cache.get(guildSettings.giveRole.requestsChannel) || null;

            // Если канала нет, отправить ошибку об этом
            if (!requestsChannel) {
                message.react(`🚫`);
                return message.channel.send(new MessageEmbed()
                    .setColor('#ff3333')
                    .setTitle("**🚫 | Произошла ошибка**")
                    .setDescription(`**Канал для отправки запроса не найден на сервере**`))
            }

            // Если все подходит, отправить запрос в указанный канал
            requestsChannel.send(new MessageEmbed()
                .setColor(guildSettings.common.color)
                .setTitle(`**📨 | Запрос роли**`)
                .setFooter(message.guild.name, message.guild.iconURL())

                // TODO: Обдумать стиль смайликов. Если можно, сделать кастомные на сервере бота
                .addFields(
                    { name: `**Пользователь**`, value: `**${message.member}**`, inline: true },
                    { name: `**Никнейм**`, value: `**${nickInfo[0]}**`, inline: true },
                    { name: `**Роли для выдачи**`, value: `**${tagInfo.giveRoles.map(r => `<@&${r}>`).join('\n')}**` },
                    { name: `**Канал отправки**`, value: `**${message.channel}**` },
                    { name: `**Информация по выдаче**`, value: `**\`[✅] - выдать роль\n[❌] - отказать в выдачи роли\n[🗑️] - удалить сообщение\`**` },
                )).then(async msg => {
                    await msg.react(`✅`);
                    await msg.react(`❌`);
                    await msg.react(`🗑️`);
                })

            // Сохраняем информацию о запросе в базу данных
            await RoleRequests.create({
                user: {
                    id: message.member.id,
                    nickInfo
                },
                guildId: message.guild.id,
                requestedChannel: message.channel.id,
                roleToGive: tagInfo.giveRoles
            })

            // Если все удачно, отправить сообщение
            message.react(`✅`);
            return message.channel.send(new MessageEmbed()
                .setColor('#6cf542')
                .setTitle("**✅ | Запрос отправлен**")
                .setDescription("**Запрос был успешно отправлен. Ожидайте проверку заявки модератором**"));
        } else {

            // Если у пользователя нет прав использовать систему ролей, отправить сообщение
            message.react(`🚫`);
            return message.channel.send(new MessageEmbed()
                .setColor('#ff3333')
                .setTitle("**🚫 | Произошла ошибка**")
                .setDescription("**Вы не можете запрашивать роли**"))
        }
    } else {

        // Если используется в запрещенном канале, отправить сообщение
        message.react(`🚫`);
        return message.channel.send(new MessageEmbed()
            .setColor('#ff3333')
            .setTitle("**🚫 | Произошла ошибка**")
            .setDescription("**Вы не можете запрашивать роли в этом канале**"))
    }
}


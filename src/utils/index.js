const { MessageEmbed } = require("discord.js");
const { DateTime } = require("luxon"); // Форматирование времени

exports.sendErrorMessage = ({ message, content, member, guildSettings, emoji = "🚫" }) => {
  message.channel
    .send(
      guildSettings.give_role.message_type == "plain_text"
        ? `**\`[${emoji} | Ошибка] \`${member}\`, ${content}\`**`
        : new MessageEmbed()
            .setColor("#ff3333")
            .setTitle(`**${emoji} | Произошла ошибка**`)
            .setAuthor(member.displayName, member.user.displayAvatarURL())
            .setDescription(`**${member}, ${content}**`)
    )
    .then((msg) => setTimeout(() => msg.delete(), 8000));
};

exports.onRunError = ({ client, warning, message }) => {
  console.warn(
    `[GiveRole] [Warn] Произошла ошибка в коде создания запроса Время: ${DateTime.local().toFormat(
      "TT"
    )}\nОшибка: ${warning.stack}`
  );

  // Если автор команды - разработчик, отправить информацию об ошибке, иначе просто факт
  if (client.isDev(message.author.id)) {
    // Если сообщение больше, чем 1024 символа (лимит в филде в ембеде), обрезать
    const messageToString =
      message.content.length > 1024 ? message.content.substring(0, 1021) + "..." : message.content;

    return message.channel.send(
      new MessageEmbed()
        .setColor("#ff3333")
        .setDescription(`**Произошла ошибка в коде системы**`)
        .addField(
          "**Отладка**",
          `**Автор: ${message.author} (\`${
            // prettier-ignore
            message.author.id
          }\`)\nСервер: **${message.guild.name}** (\`${
            // prettier-ignore
            message.guild.id
          }\`)\nВ канале: ${message.channel} (\`${message.channel.id})\`**`
        ) // prettier-ignore
        .addField("**Сообщение:**", messageToString)
        .addField(
          "**Ошибка**",
          warning.stack.length > 1024 ? warning.stack.substring(0, 1021) + "..." : warning.stack
        )
    );
  } else {
    return message.channel.send(
      new MessageEmbed()
        .setColor("#ff3333")
        .setTitle("**🚫 | Ошибка**")
        .setDescription("**Произошла ошибка в коде команды. Сообщите разработчикам об этом**")
    );
  }
};

exports.checkClientPermissions = (channel, permissions) => {
  // Список недостающих прав
  const clientMissingPermissions = [];

  // Если у бота нет прав администратора на сервере, проверяем права для бота
  if (!channel.guild.me.hasPermission("ADMINISTRATOR")) {
    permissions.forEach((permission) => {
      if (!channel.permissionsFor(channel.guild.me).has(permission))
        clientMissingPermissions.push(permission);
    });
  }
  return clientMissingPermissions;
};

exports.localizePerm = (perm) => {
  const russianNames = {
    CREATE_INSTANT_INVITE: "Создавать приглашения",
    KICK_MEMBERS: "Кикать участников",
    BAN_MEMBERS: "Банить участников",
    ADMINISTRATOR: "Администратор",
    MANAGE_CHANNELS: "Управление каналами",
    MANAGE_GUILD: "Управление сервером",
    ADD_REACTIONS: "Добавлять реакции",
    VIEW_AUDIT_LOG: "Просмотр журнала аудита",

    VIEW_CHANNEL: "Читать сообщения",
    SEND_MESSAGES: "Отправлять сообщения",
    SEND_TTS_MESSAGES: "Отправлять TTS-сообщения",
    MANAGE_MESSAGES: "Управление сообщениями",
    EMBED_LINKS: "Встраивать ссылки",
    ATTACH_FILES: "Прикреплять файлы",
    READ_MESSAGE_HISTORY: "Читать историю сообщений",
    MENTION_EVERYONE: "Упомянуть всех",
    USE_EXTERNAL_EMOJIS: "Использовать внешние эмодзи",

    CONNECT: "Подключаться в голосовые",
    SPEAK: "Говорить в голосовых",
    MUTE_MEMBERS: "Отключать микрофон",
    DEAFEN_MEMBERS: "Отключать звук",
    MOVE_MEMBERS: "Перемещать участников",
    USE_VAD: "Приоритетный режим",

    CHANGE_NICKNAME: "Изменить ник",
    MANAGE_NICKNAMES: "Управление никнеймами",
    MANAGE_ROLES: "Управление ролями",
    MANAGE_WEBHOOKS: "Управление вебхуками",
    MANAGE_EMOJIS: "Управление эмодзи",
  };

  return russianNames[perm];
};

exports.missingPermsError = ({ message, channel, missingPerms, emoji = "🔇" }) => {
  const canIgnore = message.channel.id !== channel.id;
  if (!missingPerms.includes("ADD_REACTIONS") || canIgnore) message.react(emoji);
  if (!missingPerms.includes("SEND_MESSAGES") || canIgnore)
    return message.channel
      .send(
        !missingPerms.includes("EMBED_LINKS") || canIgnore
          ? new MessageEmbed()
              .setColor("#ff3333")
              .setTitle(`**${emoji} | Произошла ошибка**`)
              .setDescription(
                "**У бота нехватает прав `" +
                  missingPerms.map((perm) => exports.localizePerm(perm)).join(", ") +
                  "` в канале <#" +
                  channel.id +
                  ">**"
              )
          : "**`[" +
              emoji +
              " | Ошибка] У бота нехватает прав '" +
              missingPerms.map((perm) => exports.localizePerm(perm)).join(", ") +
              "' в канале '" +
              channel.name +
              "'`**"
      )
      .then((msg) => setTimeout(() => msg.delete(), 15000));
};

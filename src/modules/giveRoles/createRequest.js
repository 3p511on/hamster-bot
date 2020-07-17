const { MessageEmbed } = require("discord.js"); // Для отправки сообщений типа ембед
const { checkPermissions, missingPermsError, sendErrorMessage } = require("../../utils");
const RoleRequests = require("../../api/models/RoleRequests"); // Для логирования запросов

exports.run = async ({ message, guildData }) => {
  // TODO: Добавить в БД возможность удалять сообщения автора,
  // бота по интервалу или вообще не отвечать

  // TODO: Добавить для премиум серверов (Аризона) поиск пользователя на сайте проекта

  // Проверяем, разрешено ли использование системы в данном канале
  const checkChannel =
    guildData.give_role.require.channels.length > 0 ||
    guildData.give_role.banned.channels.length > 0;

  if (checkChannel) {
    if (
      !guildData.give_role.require.channels.includes(message.channel.id) ||
      guildData.give_role.banned.channels.includes(message.channel.id)
    ) {
      // Если используется в запрещенном канале, отправить сообщение
      return sendErrorMessage({
        message,
        member: message.member,
        guildData,
        content: `вы не можете запрашивать роли в этом канале`,
      });
    }
  }
  const checkRoles =
    guildData.give_role.require.roles.length > 0 || guildData.give_role.banned.roles.length > 0;
  console.log("checkRoles", checkRoles);
  if (checkRoles) {
    if (
      !message.member.roles.cache.some((role) =>
        guildData.give_role.require.roles.includes(role.id)
      ) ||
      message.member.roles.cache.some((role) => guildData.give_role.banned.roles.includes(role.id))
    ) {
      // Если используется в запрещенном канале, отправить сообщение
      return sendErrorMessage({
        message,
        member: message.member,
        guildData,
        content: `вы не можете запрашивать роли`,
      });
    }
  }

  // Проверяем, разрешено ли пользователю использовать систему
  //   if (
  //     guildData.give_role.require.roles &&
  //     guildData.give_role.require.roles.length !== 0 &&
  //     message.member.roles.cache.some((role) =>
  //       guildData.give_role.require.roles.includes(role.id)
  //     ) &&
  //     guildData.give_role.banned.roles &&
  //     guildData.give_role.banned.roles.length !== 0 &&
  //     message.member.roles.cache.some(
  //       (role) => !guildData.give_role.banned.roles.includes(role.id)
  //     )
  //   ) {
  // Проверяем права бота на отправление сообщений, добавление реакций
  const missingPerms = checkPermissions(
    message.channel,
    ["SEND_MESSAGES", "ADD_REACTIONS", "EMBED_LINKS"],
    message.guild.me
  );
  if (missingPerms.length > 0)
    return missingPermsError({
      message,
      missingPerms,
      channel: message.channel,
    });

  // Проверяем форму ника. Создаем регулярное выражение по тому, что указано в БД
  const nickRegex = new RegExp(guildData.give_role.name_regexp, "i");

  // Если ник не подходит по форме, отправить ошибку
  if (!nickRegex || !nickRegex.test(message.member.displayName)) {
    return sendErrorMessage({
      message,
      member: message.member,
      guildData,
      content: "ваш ник не соответствует форме",
    });
  }

  // Создаем массив с информацией по нику пользователя
  let nickInfo = message.member.displayName.match(nickRegex);
  nickInfo[0] = message.member.displayName;

  // Если в БД уже есть активный запрос от данного человека, отправить ошибку
  if (
    await RoleRequests.findOne({
      "user.id": message.member.id,
      guild_id: message.guild.id,
    })
  ) {
    message.react(`⏱️`);
    return sendErrorMessage({
      message,
      member: message.member,
      guildData,
      emoji: "⏱️",
      color: "#24f0ff",
      content: "вы уже отправляли запрос. Ожидайте рассмотрения заявки модераторами",
    });
  }

  // Ищем тег пользователя в базе данных
  const tagInfo = guildData.give_role.tags
    ? guildData.give_role.tags.find((tag) => tag.names.includes(nickInfo[1]))
    : null;

  // Если указанного тега нет, отправить сообщение об ошибке
  if (!tagInfo) {
    return sendErrorMessage({
      message,
      member: message.member,
      guildData,
      content: `тег '${nickInfo[1].replace(/`/, "")}' не найден в настройках сервера`,
    });
  }

  if (!message.guild.roles.cache.some((role) => tagInfo.give_roles.includes(role.id))) {
    return sendErrorMessage({
      message,
      member: message.member,
      guildData,
      content: `одна из ролей для выдачи по тегу '${
				nickInfo[1].replace(/`/,"")}' не найдена на сервере` // prettier-ignore
    });
  }

  // Проверим, есть ли у пользователя уже роли, которые предусматривает тег
  if (checkUserRoles(message.member, tagInfo.give_roles)) {
    return sendErrorMessage({
      message,
      member: message.member,
      guildData,
      content: "у вас уже есть роли, которые предусматривает данный тег",
    });
  }

  // Поиск канала для отправки запроса
  const requestsChannel =
    message.guild.channels.cache.get(guildData.give_role.requests_channel) || null;

  // Если канала нет, отправить ошибку об этом
  if (!requestsChannel) {
    return sendErrorMessage({
      message,
      member: message.member,
      guildData,
      content: `канал для отправки запроса не найден на сервере`,
    });
  }

  // Проверяем права бота в канале для запроса ролей
  const requestChannelPerms = checkPermissions(
    requestsChannel,
    ["SEND_MESSAGES", "ADD_REACTIONS", "EMBED_LINKS", "MANAGE_MESSAGES", "VIEW_CHANNEL"],
    message.guild.me
  );
  if (requestChannelPerms.length > 0)
    return missingPermsError({
      message,
      missingPerms: requestChannelPerms,
      channel: requestsChannel,
    });

  // Если все подходит, отправить запрос в указанный канал
  requestsChannel
    .send(
      new MessageEmbed()
        .setColor(guildData.common.color)
        .setTitle(`**📨 | Запрос роли**`)

        // TODO: Обдумать стиль смайликов. Если можно, сделать кастомные на сервере бота
        .addFields(
          { name: `**Пользователь**`, value: `**${message.member}**`, inline: true },
          {
            name: `**Никнейм**`,
            value: `**${nickInfo[0].replace(/[`|"|*]/gi, "")}**`,
            inline: true,
          },
          {
            name: `**Роли для выдачи**`,
            value: `**${tagInfo.give_roles.map((r) => `<@&${r}>`).join("\n")}**`,
            inline: true,
          },
          { name: `**Канал отправки**`, value: `**${message.channel}**`, inline: true },
          {
            name: `**Информация по выдаче**`,
            value:
              "**`[✅] - выдать роль\n" +
              "[❌] - отказать в выдачи роли\n" +
              "[🔎] - проверить информацию\n" +
              "[🗑️] - удалить сообщение`**",
          }
        )
    )
    .then(async (msg) => {
      await msg.react(`✅`);
      await msg.react(`❌`);
      await msg.react(`🔎`);
      await msg.react(`🗑️`);
      msg.pin();

      // Сохраняем информацию о запросе в базу данных
      await RoleRequests.create({
        user: {
          id: message.member.id,
          nick_info: nickInfo,
        },
        guild_id: message.guild.id,
        requested_channel: message.channel.id,
        role_to_give: tagInfo.give_roles,
      });
    });

  // Если все удачно, отправить сообщение
  message.react(`✅`);
  return message.channel.send(
    guildData.give_role.message_type == "plain_text"
      ? "**`[✅ | Запрос отправлен] Запрос был успешно отправлен. Ожидайте проверку заявки модератором`**"
      : new MessageEmbed()
          .setColor("#6cf542")
          .setTitle("**✅ | Запрос отправлен**")
          .setDescription("**Запрос был успешно отправлен. Ожидайте проверку заявки модератором**")
  );
};

function checkUserRoles(member, roles) {
  const avaiableRoles = [];
  roles.forEach((role) => {
    if (member.roles.cache.some((r) => r.id == role)) {
      avaiableRoles.push(role);
    }
  });
  return avaiableRoles.length == roles.length;
}

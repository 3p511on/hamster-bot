'use strict';

const Guild = require('../models/Guild');
const { onRunError, sendErrorMessage, checkPermissions, missingPermsError } = require('../utils');

module.exports = async (client, message) => {
  if (message.author.bot || message.system) return;

  // Проверяем на наличие сервера.
  const isGuild = !!message.guild;
  let guildData = isGuild ? await Guild.findOne({ id: message.guild.id }).cache() : null;
  if (isGuild && !guildData) guildData = await Guild.create({ id: message.guild.id });

  message.i18n = message.getLanguage(guildData);

  // Проверяем, включена ли система выдачи ролей
  if (guildData && guildData.give_role.is_enabled && guildData.give_role.trigger_words.length !== 0) {
    // Создаем регулярное выражение, включая слова-триггеры для системы
    let systemTrigger = new RegExp(`^(?:${guildData.give_role.trigger_words.join('|')})$`, 'gi');
    if (systemTrigger.test(message.content)) {
      const createRequest = client.commands.find(c => c.name === 'supersecretcommand') || null;
      createRequest
        .run({ client, message, guildData })
        .catch(warning => onRunError({ warning, client, message }));
      return;
    }
  }

  // Получаем префикс бота из базы данных. По умолчанию '/'
  const thisPrefix = guildData ? guildData.common.prefix : '/';
  if (!message.content.startsWith(thisPrefix)) return;

  // Заменяем массовые упоминания на обычный текст
  message.content = message.content.replace(/@everyone/g, '**everyone**');
  message.content = message.content.replace(/@here/g, '**here**');

  // Делим сообщение на аргументы, убирая пробелы между словами. Получаем массив
  const args = message.content.slice(thisPrefix.length).trim().split(/ +/g);

  // Находим команду в базе данных
  const cmdName = args[0].toLowerCase().normalize();
  args.shift();

  const cmd = client.commands.find(
    c => c.name === cmdName || (c.aliases && c.aliases.includes(cmdName)) || null,
  );

  // Если команда есть в БД
  if (cmd && !!thisPrefix) {
    // Если команда только для разработчиков, а у автора нет прав, дать ошибку
    if (!client.isDev(message.author.id) && (['dev'].includes(cmd.category) || cmd.devOnly)) {
      sendErrorMessage({
        message,
        content: 'у вас нет прав на использование этой команды',
        member: message.member,
      });

      console.log(
        '[Message] %s попытался использовать команду для разработчиков %s %s',
        message.author.tag,
        cmd.name,
        message.guild
          ? `на сервере ${message.guild.name} в канале ${message.channel.name}`
          : `в личных сообщениях`,
      );
      return;
    }

    // Если нет сервера и команда была использована в ЛС
    if (!message.guild) {
      console.log(`[Message] ${message.author.tag} использовал команду ${cmd.name} в ЛС`);

      // Если команда требует использования на сервере, написать ошибку
      if (cmd.guildOnly) {
        sendErrorMessage({
          message,
          content: 'эта команда доступна только на сервере',
          member: message.member,
        });
        console.log(
          '[Message] %s использовал команду %s. Ошибка: команда доступна только на сервере.',
          message.author.tag,
          cmd.name,
        );
        return;
      }
    } else {
      // Логируем использование команды
      console.log(
        `[Message] ${message.author.tag} использовал команду ${cmd.name} ${
          message.guild
            ? `на сервере ${message.guild.name} в канале ${message.channel.name}`
            : `в личных сообщениях`
        }`,
      );

      // Проверяем наличие прав у пользователя/бота (TODO: необходим рефакторинг)
      const has = Object.prototype.hasOwnProperty;
      if (has.call(cmd, 'userPermissions')) {
        const missingPerms = checkPermissions(message.channel, cmd.userPermissions, message.member);
        if (missingPerms.length > 0) {
          missingPermsError({ message, channel: message.channel, missingPerms, isClient: false });
        }
      }
      if (has.call(cmd, 'clientPermissions')) {
        const missingPerms = checkPermissions(message.channel, cmd.userPermissions, message.member);
        if (missingPerms.length > 0) {
          missingPermsError({ message, channel: message.channel, missingPerms });
        }
      }

      // Если команда требует NSFW у канала, а его нет, отправить ошибку
      if (cmd.nsfw && !message.channel.nsfw) {
        sendErrorMessage({
          message,
          content: 'эта команда доступна только в NSFW каналах',
          member: message.member,
          emoji: '🔞',
        });
        return;
      }
    }

    // Запускаем команду
    cmd.run({ client, message, guildData, args }).catch(warning => onRunError({ warning, client, message }));
  }
};

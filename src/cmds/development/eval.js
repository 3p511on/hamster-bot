const Command = require('../../structures/Command');

module.exports = new Command({
    name: 'eval',
    description: 'Выполнить команду',
    devOnly: true
}, async (client, message, args) => {
    let codeToEval = args.join(" ");
    try {
        eval(codeToEval);
    } catch (err) {
        message.reply(`**\`произошла ошибка: ${err.name} - ${err.message}\`**`);
    }
})
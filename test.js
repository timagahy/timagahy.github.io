Telegram.WebApp.ready();
Telegram.WebApp.expand(); // Развернуть приложение на весь экран

const user = Telegram.WebApp.initDataUnsafe.user;
console.log(`Привет, ${user.first_name}!`);
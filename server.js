const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const WebSocket = require('ws');

const app = express();
app.use(bodyParser.json());

// Временное хранилище данных (лучше использовать базу данных, например, MongoDB или PostgreSQL)
let users = []; // Пользователи
let clans = []; // Кланы
let leaderboard = {}; // Таблица лидеров

// Авторизация через Telegram
app.post('/auth', (req, res) => {
    const user = req.body;
    const checkHash = user.hash;
    delete user.hash;

    // Проверка данных через Telegram API
    const dataCheckString = Object.keys(user)
        .sort()
        .map(key => `${key}=${user[key]}`)
        .join('\n');
    const secretKey = crypto.createHash('sha256').update(process.env.BOT_TOKEN).digest();
    const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (hash === checkHash) {
        // Сохранение пользователя
        const existingUser = users.find(u => u.id === user.id);
        if (!existingUser) {
            users.push({ ...user, score: 0, skins: [], friends: [], clan: null });
        }
        res.json({ success: true, user: existingUser || user });
    } else {
        res.json({ success: false, error: 'Invalid data' });
    }
});

// Создание клана
app.post('/createClan', (req, res) => {
    const { clanName, userId } = req.body;
    const newClan = { id: clans.length + 1, name: clanName, members: [userId] };
    clans.push(newClan);
    res.json({ success: true, clan: newClan });
});

// Вступление в клан
app.post('/joinClan', (req, res) => {
    const { clanId, userId } = req.body;
    const clan = clans.find(c => c.id === clanId);
    if (clan) {
        clan.members.push(userId);
        res.json({ success: true, clan });
    } else {
        res.json({ success: false, error: 'Клан не найден' });
    }
});

// Добавление друга
app.post('/addFriend', (req, res) => {
    const { userId, friendId } = req.body;
    const user = users.find(u => u.id === userId);
    const friend = users.find(u => u.id === friendId);

    if (user && friend) {
        user.friends.push(friendId);
        res.json({ success: true, friends: user.friends });
    } else {
        res.json({ success: false, error: 'Пользователь не найден' });
    }
});

// Запуск HTTP-сервера
const server = app.listen(3000, () => console.log('HTTP Server running on port 3000'));

// WebSocket для мультиплеера
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        const data = JSON.parse(message);
        if (data.type === 'click') {
            leaderboard[data.userId] = (leaderboard[data.userId] || 0) + 1;

            // Отправляем обновленную таблицу лидеров всем клиентам
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'click', leaderboard }));
                }
            });
        }
    });
});
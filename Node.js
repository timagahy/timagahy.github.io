const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const app = express();

app.use(bodyParser.json());

// Хранение пользователей (временное, лучше использовать базу данных)
let users = [];

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

app.listen(3000, () => console.log('Server running on port 3000'));

let clans = [];

app.post('/createClan', (req, res) => {
    const { clanName, userId } = req.body;
    const newClan = { id: clans.length + 1, name: clanName, members: [userId] };
    clans.push(newClan);
    res.json({ success: true, clan: newClan });
});

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

const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

let leaderboard = {};

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        const data = JSON.parse(message);
        if (data.type === 'click') {
            leaderboard[data.userId] = (leaderboard[data.userId] || 0) + 1;
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'click', leaderboard }));
                }
            });
        }
    });
});
const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const WebSocket = require('ws');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const winston = require('winston');

// Настройка логирования
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
            return `${timestamp} [${level.toUpperCase()}]: ${message}`;
        })
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'server.log' })
    ]
});

const app = express();
app.use(bodyParser.json());

// Указываем, что статические файлы находятся в папке "public"
app.use(express.static(path.join(__dirname, 'public')));

// Подключение к базе данных SQLite
const db = new sqlite3.Database('game_bot.db');

// Создание таблиц для хранения данных
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            username TEXT,
            score INTEGER DEFAULT 0
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS clans (
            clan_id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            members TEXT
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS leaderboard (
            user_id INTEGER PRIMARY KEY,
            score INTEGER
        )
    `);
});

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
        // Если у пользователя нет username, используем first_name или id
        const userDisplayName = user.username || user.first_name || `User_${user.id}`;

        // Сохранение пользователя
        db.get('SELECT * FROM users WHERE user_id = ?', [user.id], (err, existingUser) => {
            if (err) {
                logger.error(`Ошибка при поиске пользователя: ${err.message}`);
                return res.json({ success: false, error: 'Database error' });
            }

            if (!existingUser) {
                db.run(
                    'INSERT INTO users (user_id, username) VALUES (?, ?)',
                    [user.id, userDisplayName],
                    (err) => {
                        if (err) {
                            logger.error(`Ошибка при добавлении пользователя: ${err.message}`);
                            return res.json({ success: false, error: 'Database error' });
                        }
                        logger.info(`Новый пользователь зарегистрирован: ${userDisplayName} (ID: ${user.id})`);
                        res.json({ success: true, user: { ...user, username: userDisplayName } });
                    }
                );
            } else {
                logger.info(`Пользователь вернулся: ${userDisplayName} (ID: ${user.id})`);
                res.json({ success: true, user: existingUser });
            }
        });
    } else {
        logger.warn(`Неверные данные авторизации: ${user.id}`);
        res.json({ success: false, error: 'Invalid data' });
    }
});

// Обработчик для корневого пути (/)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Запуск HTTP-сервера
const server = app.listen(3000, () => {
    logger.info('HTTP Server running on port 3000');
});

// WebSocket для мультиплеера
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        const data = JSON.parse(message);
        if (data.type === 'click') {
            db.run(
                'UPDATE leaderboard SET score = score + 1 WHERE user_id = ?',
                [data.userId],
                (err) => {
                    if (err) {
                        logger.error(`Ошибка при обновлении таблицы лидеров: ${err.message}`);
                        return;
                    }
                    logger.info(`Пользователь ${data.userId} сделал клик.`);
                }
            );

            // Отправляем обновленную таблицу лидеров всем клиентам
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'click', leaderboard }));
                }
            });
        }
    });
});
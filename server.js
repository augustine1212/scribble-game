const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

let rooms = {};

app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html for root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('joinRoom', ({ roomId, username }) => {
        socket.join(roomId);

        if (!rooms[roomId]) {
            rooms[roomId] = { players: [], currentDrawerIndex: 0, word: '' };
        }

        rooms[roomId].players.push({ id: socket.id, username });
        io.to(roomId).emit('updatePlayers', rooms[roomId].players);

        if (rooms[roomId].players.length === 2) {
            startNewRound(roomId);
        }
    });

    socket.on('drawing', (data) => {
        const roomId = data.roomId;
        socket.to(roomId).emit('drawing', data);
    });

    socket.on('guess', ({ roomId, guess, username }) => {
        const word = rooms[roomId].word;
        if (guess.toLowerCase() === word.toLowerCase()) {
            io.to(roomId).emit('correctGuess', { username, word });
            nextDrawer(roomId);
        } else {
            io.to(roomId).emit('newGuess', { username, guess });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        for (let roomId in rooms) {
            const room = rooms[roomId];
            room.players = room.players.filter(p => p.id !== socket.id);
            io.to(roomId).emit('updatePlayers', room.players);
            if (room.players.length === 0) {
                delete rooms[roomId];
            }
        }
    });
});

function startNewRound(roomId) {
    const room = rooms[roomId];
    room.word = randomWord();
    room.currentDrawerIndex = 0;

    const drawer = room.players[room.currentDrawerIndex];
    io.to(roomId).emit('newRound', { drawerId: drawer.id });
    io.to(drawer.id).emit('yourTurnToDraw', room.word);
}

function nextDrawer(roomId) {
    const room = rooms[roomId];
    room.currentDrawerIndex = (room.currentDrawerIndex + 1) % room.players.length;
    room.word = randomWord();

    const drawer = room.players[room.currentDrawerIndex];
    io.to(roomId).emit('newRound', { drawerId: drawer.id });
    io.to(drawer.id).emit('yourTurnToDraw', room.word);
}

function randomWord() {
    const words = ['apple', 'car', 'house', 'tree', 'cat', 'dog', 'sun', 'book'];
    return words[Math.floor(Math.random() * words.length)];
}

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

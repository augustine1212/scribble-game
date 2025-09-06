const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve static files from the root directory (where your HTML, CSS, JS are)
app.use(express.static(__dirname));

// Serve index.html for root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- Game Configuration ---
const ROUND_TIME = 90; // seconds per round
const WORDS_TO_CHOOSE = 3; // Number of words presented to the drawer
const CORRECT_GUESS_SCORE = 100; // Points for a correct guess
const MAX_PLAYERS_PER_ROOM = 10; // Optional: Max players

// Example words array (you can expand this significantly!)
const words = [
    "house", "tree", "car", "dog", "cat", "sun", "moon", "star", "flower",
    "book", "chair", "table", "computer", "phone", "hat", "shoe", "shirt",
    "apple", "banana", "grape", "orange", "pizza", "burger", "coffee", "tea",
    "mountain", "river", "ocean", "cloud", "rain", "snow", "wind", "fire",
    "bird", "fish", "bear", "lion", "tiger", "zebra", "elephant", "giraffe",
    "rocket", "robot", "alien", "magic", "wizard", "castle", "knight", "dragon",
    "guitar", "piano", "drum", "violin", "saxophone", "trumpet", "flute",
    "camera", "television", "radio", "microphone", "headphones", "speaker",
    "bicycle", "motorcycle", "train", "airplane", "boat", "submarine", "bus",
    "doctor", "teacher", "engineer", "artist", "chef", "pilot", "police",
    "football", "basketball", "tennis", "soccer", "golf", "swimming", "boxing",
    "diamond", "ruby", "emerald", "sapphire", "pearl", "gold", "silver", "bronze",
    "pyramid", "sphinx", "statue", "fountain", "bridge", "tower", "castle",
    "ghost", "vampire", "werewolf", "zombie", "monster", "witch", "wizard",
    "rainbow", "thunder", "lightning", "storm", "hurricane", "tornado", "volcano",
    "desert", "forest", "jungle", "swamp", "glacier", "canyon", "cave", "island"
];

// --- Rooms Data Structure ---
const rooms = {};
/*
rooms = {
    'roomId1': {
        players: [
            { id: 'socketId1', username: 'player1', score: 0, isDrawer: false, hasGuessedCorrectlyThisRound: false },
            { id: 'socketId2', username: 'player2', score: 0, isDrawer: true, hasGuessedCorrectlyThisRound: false }
        ],
        currentDrawerIndex: 1, // Index in the players array
        currentWord: 'elephant',
        wordHint: '_ _ _ _ _ _ _ _',
        timer: 60,
        roundInterval: null, // Stores setInterval ID
        drawingHistory: [], // Array of drawing data points for canvas sync
        roundActive: false,
        currentRound: 0,
        gameStarted: false, // Flag to indicate if game has truly begun (min players met)
        drawerTimeout: null, // Timeout for drawer to choose a word
    },
    'roomId2': { ... }
}
*/

// --- Helper Functions ---
function getRandomWords(count = WORDS_TO_CHOOSE) {
    const shuffled = words.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

function resetPlayerGuessStatus(room) {
    room.players.forEach(p => p.hasGuessedCorrectlyThisRound = false);
}

function getPlayerPublicData(player) {
    return {
        id: player.id,
        username: player.username,
        score: player.score,
        isDrawer: player.isDrawer,
    };
}

function startRoundTimer(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    clearInterval(room.roundInterval); // Clear any existing timer
    room.timer = ROUND_TIME;

    io.to(roomId).emit('timerUpdate', room.timer);

    room.roundInterval = setInterval(() => {
        room.timer--;
        io.to(roomId).emit('timerUpdate', room.timer);

        if (room.timer <= 0) {
            endRound(roomId, 'Time is up! No one guessed the word.');
        }
    }, 1000);
}

function endRound(roomId, message = '') {
    const room = rooms[roomId];
    if (!room) return;

    clearInterval(room.roundInterval);
    clearTimeout(room.drawerTimeout);

    room.roundActive = false;
    room.currentWord = '';
    room.wordHint = '';
    room.drawingHistory = []; // Clear canvas for next round
    resetPlayerGuessStatus(room);

    io.to(roomId).emit('roundEnd', { message });
    io.to(roomId).emit('clearCanvas'); // Ensure client canvases are cleared

    // Reset drawer status for all players
    room.players.forEach(p => p.isDrawer = false);
    io.to(roomId).emit('updatePlayers', room.players.map(getPlayerPublicData)); // Update player list

    // Start a new round after a short delay
    setTimeout(() => {
        startNewRound(roomId);
    }, 3000); // 3-second pause between rounds
}

function startNewRound(roomId) {
    const room = rooms[roomId];
    if (!room || room.players.length < 1) { // Need at least one player to start a round
        if (room) room.gameStarted = false;
        return;
    }

    clearInterval(room.roundInterval); // Ensure no old timers are running
    clearTimeout(room.drawerTimeout); // Clear any pending word choice timeout

    room.currentRound++;
    room.currentWord = ''; // Word is chosen by drawer
    room.wordHint = '';
    room.drawingHistory = [];
    room.roundActive = true;
    resetPlayerGuessStatus(room);

    // Determine the next drawer
    room.currentDrawerIndex = (room.currentDrawerIndex + 1) % room.players.length;
    const drawer = room.players[room.currentDrawerIndex];

    // Update isDrawer status for players
    room.players.forEach(p => p.isDrawer = (p.id === drawer.id));
    io.to(roomId).emit('updatePlayers', room.players.map(getPlayerPublicData));

    io.to(roomId).emit('chatMessage', { username: null, message: `New round! ${drawer.username} is drawing.`, type: 'system' });
    io.to(roomId).emit('clearCanvas'); // Clear canvas before new drawing starts

    const wordsForChoice = getRandomWords();
    io.to(drawer.id).emit('yourTurnToChooseWord', wordsForChoice);
    io.to(roomId).emit('roundStart', {
        drawerId: drawer.id,
        wordHint: '_ _ _ _ _', // Generic hint until word is chosen
        timer: ROUND_TIME // Show max timer
    });

    // Timeout if drawer doesn't choose a word
    room.drawerTimeout = setTimeout(() => {
        if (!room.currentWord) {
            io.to(roomId).emit('chatMessage', { username: null, message: `${drawer.username} failed to choose a word.`, type: 'system' });
            endRound(roomId, 'Drawer failed to choose a word.');
        }
    }, 15000); // 15 seconds to choose a word
}

// --- Socket.IO Connection Handling ---
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('joinRoom', ({ username, roomId }) => {
        if (!username || !roomId) {
            socket.emit('error', 'Username and Room ID are required.');
            return;
        }

        if (!rooms[roomId]) {
            rooms[roomId] = {
                players: [],
                currentDrawerIndex: -1, // No drawer initially
                currentWord: '',
                wordHint: '',
                timer: 0,
                roundInterval: null,
                drawingHistory: [],
                roundActive: false,
                currentRound: 0,
                gameStarted: false,
                drawerTimeout: null,
            };
        }

        const room = rooms[roomId];

        // Check for duplicate username in the room
        if (room.players.some(p => p.username === username)) {
            socket.emit('error', 'Username already taken in this room. Please choose another.');
            return;
        }

        // Check if room is full (optional)
        if (room.players.length >= MAX_PLAYERS_PER_ROOM) {
            socket.emit('error', 'This room is full. Please try another room.');
            return;
        }

        socket.join(roomId);
        socket.username = username; // Attach to socket for easy access
        socket.roomId = roomId;

        const newPlayer = { id: socket.id, username, score: 0, isDrawer: false, hasGuessedCorrectlyThisRound: false };
        room.players.push(newPlayer);

        io.to(roomId).emit('playerJoined', username);
        io.to(roomId).emit('updatePlayers', room.players.map(getPlayerPublicData)); // Send public player data

        // If the game hasn't started and we have enough players, start it
        if (!room.gameStarted && room.players.length >= 1) { // Min 1 player to "start" waiting for game
            room.gameStarted = true;
            if (room.players.length === 1) {
                io.to(roomId).emit('chatMessage', { username: null, message: `Waiting for more players to join room ${roomId}...`, type: 'system' });
            }
            startNewRound(roomId);
        } else if (room.roundActive) {
            // New player joins an active round
            socket.emit('roundStart', {
                drawerId: room.currentDrawer, // Will be socket.id of drawer
                wordHint: room.wordHint,
                timer: room.timer
            });

            // Send existing drawing history to the new player
            room.drawingHistory.forEach(data => {
                socket.emit('drawing', data);
            });
        }
    });

    socket.on('wordChosen', ({ roomId, word }) => {
        const room = rooms[roomId];
        if (room && socket.id === room.players[room.currentDrawerIndex]?.id && !room.currentWord) {
            room.currentWord = word;
            room.wordHint = word.replace(/[a-zA-Z]/g, '_ ').trim();
            io.to(roomId).emit('roundStart', {
                drawerId: socket.id,
                wordHint: room.wordHint,
                timer: ROUND_TIME // Start timer now
            });
            io.to(roomId).emit('chatMessage', { username: null, message: `The word has been chosen! Start guessing!`, type: 'system' });
            startRoundTimer(roomId);
            clearTimeout(room.drawerTimeout); // Clear word choice timeout
        } else if (room && socket.id === room.players[room.currentDrawerIndex]?.id) {
             // If drawer tries to choose again or chooses when not their turn to choose
             socket.emit('error', 'You already chose a word or it\'s not your turn to choose.');
        } else {
            socket.emit('error', 'Not authorized to choose a word.');
        }
    });

    socket.on('drawing', (data) => {
        const room = rooms[data.roomId];
        if (room && socket.id === room.players[room.currentDrawerIndex]?.id) { // Only current drawer can send drawing data
            room.drawingHistory.push(data); // Store for new players/sync
            socket.to(data.roomId).emit('drawing', data); // Broadcast to others
        }
    });

    socket.on('clearCanvas', (roomId) => {
        const room = rooms[roomId];
        if (room && socket.id === room.players[room.currentDrawerIndex]?.id) { // Only current drawer can clear
            room.drawingHistory = []; // Clear history
            io.to(roomId).emit('clearCanvas');
        }
    });

    socket.on('chatMessage', ({ roomId, message, username }) => {
        const room = rooms[roomId];
        if (!room || !message.trim()) return;

        const sender = room.players.find(p => p.id === socket.id);
        if (!sender) return; // Should not happen if player is in room

        // Check if it's a guess (only if round is active and sender is not the drawer)
        if (room.roundActive && room.currentWord && sender.id !== room.players[room.currentDrawerIndex]?.id) {
            if (message.toLowerCase() === room.currentWord.toLowerCase()) {
                if (!sender.hasGuessedCorrectlyThisRound) {
                    sender.score += CORRECT_GUESS_SCORE;
                    sender.hasGuessedCorrectlyThisRound = true;
                    io.to(roomId).emit('correctGuess', { username, word: room.currentWord, score: sender.score });
                    io.to(roomId).emit('chatMessage', { username: null, message: `${username} guessed correctly! The word was: ${room.currentWord}.`, type: 'system' });
                    io.to(roomId).emit('updatePlayers', room.players.map(getPlayerPublicData)); // Update scores

                    endRound(roomId, `${username} guessed the word!`);
                    return; // Don't send as a regular chat message
                }
            } else {
                // It's a guess, but incorrect
                io.to(roomId).emit('newGuess', { username, guess: message });
                return; // Don't send as a regular chat message
            }
        }

        // If not a guess, or if drawer, send as regular chat
        io.to(roomId).emit('chatMessage', { username, message, type: 'chat' });
    });

    socket.on('leaveRoom', (roomId) => {
        handlePlayerLeave(socket, roomId);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Find and remove player from any room they might be in
        for (const roomId in rooms) {
            if (rooms[roomId].players.some(p => p.id === socket.id)) {
                handlePlayerLeave(socket, roomId);
                break; // Player can only be in one room
            }
        }
    });

    function handlePlayerLeave(socket, roomId) {
        const room = rooms[roomId];
        if (!room) return;

        room.players = room.players.filter(p => p.id !== socket.id);
        io.to(roomId).emit('playerLeft', socket.username || 'A player');
        io.to(roomId).emit('updatePlayers', room.players.map(getPlayerPublicData));

        if (room.players.length === 0) {
            // No players left, clean up the room
            clearInterval(room.roundInterval);
            clearTimeout(room.drawerTimeout);
            delete rooms[roomId];
            console.log(`Room ${roomId} deleted.`);
        } else if (room.players.length === 1 && room.gameStarted) {
            // Only one player left, stop active round
            io.to(roomId).emit('chatMessage', { username: null, message: 'Not enough players to continue. Waiting for more.', type: 'system' });
            endRound(roomId, 'Not enough players.'); // This will also trigger a new round attempt
            room.gameStarted = false; // Mark game as not started
        } else if (room.roundActive && socket.id === room.players[room.currentDrawerIndex]?.id) {
            // The drawer left, end the current round and start a new one
            io.to(roomId).emit('chatMessage', { username: null, message: `${socket.username} (the drawer) left!`, type: 'system' });
            endRound(roomId, 'The drawer left the game.');
        }
        socket.leave(roomId);
    }
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open your browser to http://localhost:${PORT}`);
});

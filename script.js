const socket = io();

let isDrawer = false;
let currentWord = '';
let roomId = '';
let canvas = document.getElementById('canvas');
let ctx = canvas.getContext('2d');
let drawing = false;

document.getElementById('joinBtn').onclick = () => {
    const username = document.getElementById('username').value.trim();
    roomId = document.getElementById('roomId').value.trim();
    if (username && roomId) {
        socket.emit('joinRoom', { username, roomId });
        document.getElementById('lobby').style.display = 'none';
        document.getElementById('game').style.display = 'block';
    }
};

socket.on('updatePlayers', (players) => {
    const list = document.getElementById('playersList');
    list.innerHTML = '';
    players.forEach(p => {
        const li = document.createElement('li');
        li.textContent = p.username;
        list.appendChild(li);
    });
});

canvas.addEventListener('mousedown', () => { if (isDrawer) drawing = true; });
canvas.addEventListener('mouseup', () => { drawing = false; ctx.beginPath(); });
canvas.addEventListener('mousemove', (e) => {
    if (!isDrawer || !drawing) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000';
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);

    socket.emit('drawing', { roomId, x, y });
});

socket.on('drawing', (data) => {
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000';
    ctx.lineTo(data.x, data.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(data.x, data.y);
});

document.getElementById('guessBtn').onclick = () => {
    const guess = document.getElementById('guessInput').value.trim();
    if (guess) {
        socket.emit('guess', { roomId, guess, username: document.getElementById('username').value });
        document.getElementById('guessInput').value = '';
    }
};

socket.on('newGuess', ({ username, guess }) => {
    const msgDiv = document.getElementById('messages');
    const msg = document.createElement('div');
    msg.textContent = `${username} guessed: ${guess}`;
    msgDiv.appendChild(msg);
});

socket.on('correctGuess', ({ username, word }) => {
    const msgDiv = document.getElementById('messages');
    const msg = document.createElement('div');
    msg.style.color = 'green';
    msg.textContent = `${username} guessed correctly! The word was: ${word}`;
    msgDiv.appendChild(msg);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
});

socket.on('newRound', ({ drawerId }) => {
    isDrawer = (socket.id === drawerId);
    const msgDiv = document.getElementById('messages');
    const msg = document.createElement('div');
    msg.textContent = isDrawer ? 'You are the drawer!' : 'Guess the word!';
    msgDiv.appendChild(msg);
    if (!isDrawer) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
});

socket.on('yourTurnToDraw', (word) => {
    currentWord = word;
    alert(`You are drawing! The word is: ${word}`);
});

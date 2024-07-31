const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(cors());
app.use(express.json());

const users = {}; // Store connected users with their socket IDs

io.on('connection', (socket) => {
    console.log('New client connected');

    // Handle user login
    socket.on('login', (userId) => {
        users[userId] = socket.id;
        console.log(`User ${userId} connected`);
        // Notify other users that this user has connected
        socket.broadcast.emit('userConnected', userId);
    });

    // Handle sending messages
    socket.on('sendMessage', (messageData) => {
        const { sender, receiver, content } = messageData;
        if (users[receiver]) {
            io.to(users[receiver]).emit('receiveMessage', {
                sender,
                content,
                timestamp: new Date()
            });
        }
    });

    // Handle typing status
    socket.on('typing', (userId) => {
        socket.broadcast.emit('typing', userId);
    });

    socket.on('stopTyping', () => {
        socket.broadcast.emit('stopTyping');
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('Client disconnected');
        // Remove user from the users list
        for (let userId in users) {
            if (users[userId] === socket.id) {
                delete users[userId];
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

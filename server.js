const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: process.env.CLIENT_URL || 'https://paradox974333.github.io',
        methods: ['GET', 'POST', 'DELETE'],
        allowedHeaders: ['Content-Type']
    }
});

const port = process.env.PORT || 3000;
const mongoURI = process.env.MONGO_URI;

// Connect to MongoDB
mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));

// Define schema and model for messages
const messageSchema = new mongoose.Schema({
    sender: { type: String, required: true },
    receiver: { type: String, required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    isDeleted: { type: Boolean, default: false }
});
const Message = mongoose.model('Message', messageSchema);

// Middleware
app.use(express.json());
app.use(cors({
    origin: process.env.CLIENT_URL || 'https://paradox974333.github.io',
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.static('public'));

// Helper function to emit error
function emitError(socket, error) {
    console.error('Error:', error);
    socket.emit('error', { message: 'An error occurred', details: error.message });
}

// WebSocket connection handling
io.on('connection', (socket) => {
    console.log('New client connected');

    socket.on('identify', async (userId) => {
        try {
            const messages = await Message.find({
                $or: [
                    { sender: userId },
                    { receiver: userId }
                ],
                isDeleted: false
            }).sort({ timestamp: 1 });

            socket.emit('previousMessages', messages);
        } catch (err) {
            emitError(socket, err);
        }
    });

    socket.on('sendMessage', async (data) => {
        try {
            const { sender, receiver, content } = data;
            const message = new Message({ sender, receiver, content });
            await message.save();

            io.emit('receiveMessage', message);
        } catch (err) {
            emitError(socket, err);
        }
    });

    socket.on('deleteMessage', async (messageId) => {
        try {
            const message = await Message.findById(messageId);
            if (!message) {
                return socket.emit('error', { message: 'Message not found' });
            }

            message.isDeleted = true;
            await message.save();

            io.emit('messageDeleted', messageId);
            console.log(`Message ${messageId} marked as deleted`);
        } catch (err) {
            emitError(socket, err);
        }
    });

    socket.on('editMessage', async (data) => {
        try {
            const { messageId, newContent } = data;
            const message = await Message.findById(messageId);
            if (!message) {
                return socket.emit('error', { message: 'Message not found' });
            }

            message.content = newContent;
            await message.save();

            io.emit('messageEdited', { messageId, newContent });
        } catch (err) {
            emitError(socket, err);
        }
    });

    socket.on('typing', (userId) => {
        socket.broadcast.emit('typing', userId);
    });

    socket.on('stopTyping', () => {
        socket.broadcast.emit('stopTyping');
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Start the server
server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

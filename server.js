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
        origin: process.env.CLIENT_URL || '*',
        methods: ['GET', 'POST', 'DELETE', 'PUT'],
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
    isDeleted: { type: Boolean, default: false },
    edited: { type: Boolean, default: false }
});

const Message = mongoose.model('Message', messageSchema);

// Define schema for active users (for better handling of typing indicators)
const activeUsersSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    socketId: { type: String, required: true },
    lastActive: { type: Date, default: Date.now }
});

const ActiveUser = mongoose.model('ActiveUser', activeUsersSchema);

// Middleware
app.use(express.json());
app.use(cors({
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST', 'DELETE', 'PUT'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.static('public'));

// Helper function to emit error
function emitError(socket, error) {
    console.error('Error:', error);
    socket.emit('error', { message: 'An error occurred', details: error.message });
}

// Basic route for checking server status
app.get('/', (req, res) => {
    res.send('Chat server is running');
});

// API route to get messages
app.get('/api/messages', async (req, res) => {
    try {
        const { sender, receiver } = req.query;
        const query = {};
        
        if (sender) query.sender = sender;
        if (receiver) query.receiver = receiver;
        
        const messages = await Message.find(query).sort({ timestamp: 1 });
        res.json(messages);
    } catch (err) {
        console.error('Error fetching messages:', err);
        res.status(500).json({ message: 'Server error', details: err.message });
    }
});

// WebSocket connection handling
io.on('connection', async (socket) => {
    console.log('New client connected:', socket.id);

    // Handle user identification
    socket.on('identify', async (userId) => {
        try {
            // Store active user
            await ActiveUser.findOneAndUpdate(
                { userId },
                { userId, socketId: socket.id, lastActive: new Date() },
                { upsert: true, new: true }
            );

            // Get user's conversations
            const messages = await Message.find({
                $or: [
                    { sender: userId },
                    { receiver: userId }
                ],
                isDeleted: false
            }).sort({ timestamp: 1 });

            socket.emit('previousMessages', messages);
            console.log(`User ${userId} identified`);
        } catch (err) {
            emitError(socket, err);
        }
    });

    // Handle sending messages
    socket.on('sendMessage', async (data) => {
        try {
            const { sender, receiver, content } = data;
            const message = new Message({ sender, receiver, content });
            await message.save();

            io.emit('receiveMessage', message);
            console.log(`Message sent from ${sender} to ${receiver}`);
        } catch (err) {
            emitError(socket, err);
        }
    });

    // Handle deleting messages
    socket.on('deleteMessage', async (messageId) => {
        try {
            const message = await Message.findById(messageId);
            if (!message) {
                return socket.emit('error', { message: 'Message not found' });
            }

            message.isDeleted = true;
            message.content = 'This message was deleted';
            await message.save();

            io.emit('messageDeleted', messageId);
            console.log(`Message ${messageId} marked as deleted`);
        } catch (err) {
            emitError(socket, err);
        }
    });

    // Handle editing messages
    socket.on('editMessage', async (data) => {
        try {
            const { messageId, newContent } = data;
            const message = await Message.findById(messageId);
            if (!message) {
                return socket.emit('error', { message: 'Message not found' });
            }

            message.content = newContent;
            message.edited = true;
            await message.save();

            io.emit('messageEdited', { messageId, newContent });
            console.log(`Message ${messageId} edited`);
        } catch (err) {
            emitError(socket, err);
        }
    });

    // Handle typing indicators
    socket.on('typing', (userId) => {
        socket.broadcast.emit('typing', userId);
    });

    socket.on('stopTyping', () => {
        socket.broadcast.emit('stopTyping');
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
        try {
            // Find user by socket ID and remove from active users
            await ActiveUser.findOneAndDelete({ socketId: socket.id });
            console.log('Client disconnected:', socket.id);
        } catch (err) {
            console.error('Error handling disconnect:', err);
        }
    });
});

// Cleanup inactive users periodically (every 10 minutes)
setInterval(async () => {
    try {
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        await ActiveUser.deleteMany({ lastActive: { $lt: tenMinutesAgo } });
        console.log('Cleaned up inactive users');
    } catch (err) {
        console.error('Error cleaning up inactive users:', err);
    }
}, 10 * 60 * 1000);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Start the server
server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        mongoose.connection.close(false, () => {
            console.log('MongoDB connection closed');
            process.exit(0);
        });
    });
});

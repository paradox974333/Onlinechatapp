const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config(); // Load environment variables from .env file

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const port = process.env.PORT || 3000;
const mongoURI = process.env.MONGO_URI;

// Configure CORS to allow requests from your GitHub Pages URL
app.use(cors({
    origin: 'https://paradox974333.github.io', // Replace with your actual GitHub Pages URL
    methods: ['GET', 'POST'],
}));

// Connect to MongoDB
mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));

// Define schema and model for messages
const messageSchema = new mongoose.Schema({
    sender: String,
    receiver: String,
    content: String,
    timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

// Serve static files from the "public" directory
app.use(express.static('public'));

// WebSocket connection handling
io.on('connection', (socket) => {
    console.log('New client connected');

    socket.on('sendMessage', async (data) => {
        const { sender, receiver, content } = data;
        const message = new Message({ sender, receiver, content });
        await message.save();

        // Broadcast message to all connected clients
        io.emit('receiveMessage', message);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// Start the server
server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

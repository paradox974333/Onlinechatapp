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
        origin: 'https://paradox974333.github.io', // Adjust this origin as needed
        methods: ['GET', 'POST'],
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
    sender: String,
    receiver: String,
    content: String,
    timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

// Enable CORS
app.use(cors({
    origin: 'https://paradox974333.github.io', // Adjust this origin as needed
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

// Serve static files
app.use(express.static('public'));

// WebSocket connection handling
io.on('connection', (socket) => {
    console.log('New client connected');

    socket.on('sendMessage', async (data) => {
        const { sender, receiver, content } = data;
        const message = new Message({ sender, receiver, content });
        await message.save();

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

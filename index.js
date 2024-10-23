const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "https://your-vercel-app.vercel.app", 
        methods: ["GET", "POST"],
        credentials: true, // Allow credentials if needed
    }
});

// CORS configuration for the Express app
app.use(cors({
    origin: "https://your-vercel-app.vercel.app", 
    methods: ["GET", "POST"],
    credentials: true // Allow credentials if needed
}));

let activeUsers = []; // Active users as an array of objects

app.get('/', (req, res) => {
    res.send('Master Node is running.');
});

// Handle socket connections
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.request.connection.remoteAddress;

    // When a user comes online
    socket.on('user_online', (username) => {
        activeUsers.push({ username, socketId: socket.id, ipAddress: clientIp });
        io.emit('active_users', activeUsers); // Emit the list of active users to all clients
        console.log(`User ${username} is online with IP ${clientIp}.`);
    });

    // When a user disconnects
    socket.on('disconnect', () => {
        const index = activeUsers.findIndex(user => user.socketId === socket.id);
        if (index !== -1) {
            const user = activeUsers[index];
            activeUsers.splice(index, 1); // Remove the disconnected user from the list
            io.emit('active_users', activeUsers); // Update the active users list
            console.log('User disconnected:', user.username);
        }
    });

    // When a user tries to initiate a call
    socket.on('call_user', (data) => {
        const { from, to, offer } = data; // Get the data sent from the client (caller)
        const targetUser = activeUsers.find(user => user.username === to);
        const fromUser = activeUsers.find(user => user.socketId === socket.id); // Find the caller

        if (targetUser && fromUser) {
            io.to(targetUser.socketId).emit('incoming_call', { from: fromUser.username, offer });
            console.log(`User ${fromUser.username} is calling ${targetUser.username}.`);
        } else {
            socket.emit('user_not_available', to); // Notify the caller that the target is unavailable
            console.log(`User ${to} is not available.`);
        }
    });

    // Handling call response (answer/decline)
    socket.on('call_response', (data) => {
        const { from, to, answer, accepted } = data; // Get the response from the callee
        const fromUser = activeUsers.find(user => user.username === from); // Find the caller

        if (fromUser) {
            if (accepted) {
                io.to(fromUser.socketId).emit('call_response', { from: to, answer }); // Send the answer back to the caller
                console.log(`${to} accepted the call from ${from}.`);
            } else {
                io.to(fromUser.socketId).emit('call_declined', { from: to }); // Notify the caller the call was declined
                console.log(`${to} declined the call from ${from}.`);
            }
        }
    });

    // Handling ICE candidates for WebRTC peer connection
    socket.on('ice_candidate', (data) => {
        const { candidate, to } = data;
        const targetUser = activeUsers.find(user => user.username === to);
        
        if (targetUser) {
            io.to(targetUser.socketId).emit('ice_candidate', { candidate }); // Forward the ICE candidate
            console.log(`ICE Candidate sent from ${socket.id} to ${targetUser.username}.`);
        }
    });
});

// Start the server on port 3000
server.listen(3000, () => {
    console.log('Master Node running on port 3000.');
});

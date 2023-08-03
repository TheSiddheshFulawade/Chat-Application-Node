const app = require('express')();
const cors = require('cors');
const http = require('http');
const jwt = require('jsonwebtoken');
const server = http.createServer(app);
const { Server } = require('socket.io');
const bodyParser = require('body-parser');
const { randomUUID } = require('crypto');

const io = new Server(server, {
  cors: {
    origins: "*"
  }
});

const PORT = process.env.PORT || 3700;

const JWT_SECRET = "This!sS3CR3T";
var activeAgents = [];

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors({
  origin: '*'
}));

io.use(async (socket, next) => {
  //fetch token from handshake auth sent by FE
  let token;
  try {
    token = socket.handshake.headers['authorization'];
  } catch (err) {
    console.error(err.message);
    return;
  }

  try {
    // verify jwt token and get user data
    const user = await jwt.verify(token, JWT_SECRET);

    // save the user data into socket object, to be used further
    socket.user = user;
    next();
  } catch (e) {
    // if token is invalid, close connection
    console.error(e);
    return next(new Error(e.message));
  }
});

// Handle Socket.IO connections
io.on('connection', async (socket) => {
  //Join the room specified in the socket's query string

  const room = socket.user.roomName;
  socket.join(room);

  if (room != 'Public' && activeAgents.length > 0) {
    // Remove the first agent from the array and store it in a variable
    const agent = activeAgents.shift();
    agent.join(room);
    io.to(room).emit('startNewChat', {roomName:room, riderName:socket.user.name, agentName: agent.user.name});
    // Send a message
    socket.on('message', ({ messagetext }) => {
      io.to(room).emit('message', messagetext, socket.user.name);
    });

    socket.on("disconnect", () => {
      console.log("Disconnected", socket.user.name);
      io.to(room).emit('endChat');
      
    });

  } else if (socket.user.role == 'Agent') {
    activeAgents.push(socket);
    socket.on('message', ({ messagetext, roomName }) => {
      io.to(roomName).emit('message', messagetext, socket.user.name);
    });

    socket.on("disconnect", () => {
      console.log("Disconnected", socket.user.name);
      const index = activeAgents.indexOf(socket);

      // If the socket is found in the array, remove it
      if (index !== -1) {
        activeAgents.splice(index, 1);
      }
    });
  }

});

//Rest API to established connection and issue JWT
app.post('/', (request, response) => {
  console.log(request.body);
  let userName = request.body.userName;
  let userRole = request.body.userRole;

  let roomName = 'Public';
  if (userRole == 'Rider') {
    roomName = randomUUID();
  }
  const user = {
    name: userName,
    roomName: roomName,
    role: userRole
  };
  console.log(user);
  const token = jwt.sign(user, JWT_SECRET);
  response.send({ token });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Socket.IO server listening on port ${PORT}`);
});
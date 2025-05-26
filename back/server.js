import { createServer } from 'http';
import { Server } from 'socket.io';
import robot from 'robotjs';

// Configure robotjs for better performance
robot.setMouseDelay(2);
robot.setKeyboardDelay(2);

const server = createServer();
const io = new Server(server, {
  cors: {
    origin: "*", // Allow connections from any origin (your mobile app)
    methods: ["GET", "POST"]
  },
  transports: ['websocket']
});

const PORT = 3000;

// Store connected clients
const connectedClients = new Set();

io.on('connection', (socket) => {
  connectedClients.add(socket.id);
  console.log(`📱 Client connected: ${socket.id} (Total: ${connectedClients.size})`);

  // Handle mouse movement
  socket.on('mouse-move', (data) => {
    try {
      const { dx, dy } = data;
      
      // Get current mouse position
      const currentPos = robot.getMousePos();
      
      // Calculate new position
      const newX = Math.max(0, currentPos.x + dx);
      const newY = Math.max(0, currentPos.y + dy);
      
      // Get screen size to prevent moving outside bounds
      const screenSize = robot.getScreenSize();
      const boundedX = Math.min(screenSize.width - 1, newX);
      const boundedY = Math.min(screenSize.height - 1, newY);
      
      // Move mouse to new position
      robot.moveMouse(boundedX, boundedY);
      
    } catch (error) {
      console.error('❌ Error moving mouse:', error.message);
    }
  });

  // Handle mouse clicks
  socket.on('mouse-click', (button) => {
    try {
      let robotButton;
      
      switch (button) {
        case 'left':
          robotButton = 'left';
          break;
        case 'right':
          robotButton = 'right';
          break;
        case 'middle':
          robotButton = 'middle';
          break;
        default:
          console.warn('⚠️ Unknown button:', button);
          return;
      }
      
      console.log(`🖱️ ${button} click at position:`, robot.getMousePos());
      robot.mouseClick(robotButton);
      
    } catch (error) {
      console.error('❌ Error clicking mouse:', error.message);
    }
  });

  // Handle double-click
  socket.on('mouse-double-click', () => {
    try {
      console.log('🖱️ Double-click at position:', robot.getMousePos());
      robot.mouseClick('left', true); // true parameter for double-click
      
    } catch (error) {
      console.error('❌ Error double-clicking:', error.message);
    }
  });

  // Handle screen toggle - wake/sleep
  socket.on('screen-toggle', () => {
    try {
      console.log('💻 Toggling screen power');
      
      // Cross-platform screen control
      if (process.platform === 'win32') {
        // Windows: Turn off monitor using Windows+L (lock) or monitor off
        robot.keyTap('l', ['cmd']);
      } else if (process.platform === 'darwin') {
        // macOS: Put display to sleep
        robot.keyTap('q', ['control', 'shift']);
      } else {
        // Linux: Lock screen
        robot.keyTap('l', ['control', 'alt']);
      }
      
    } catch (error) {
      console.error('❌ Error toggling screen:', error.message);
    }
  });

  // Handle mouse scrolling
  socket.on('mouse-scroll', (data) => {
    try {
      const { direction, delta = 1 } = data;
      
      // Calculate scroll amount (robotjs uses positive for up, negative for down)
      const scrollAmount = direction === 'up' ? Math.ceil(delta) : -Math.ceil(delta);
      
      console.log(`📜 Scrolling ${direction} with delta:`, scrollAmount);
      robot.scrollMouse(0, scrollAmount);
      
    } catch (error) {
      console.error('❌ Error scrolling:', error.message);
    }
  });

  // Handle keyboard input (NEW FEATURE)
socket.on('keyboard-type', (data) => {
  try {
    const { text } = data;
    console.log(`⌨️ Typing text: "${text}"`);
    
    // First simulate a click to ensure focus
    const currentPos = robot.getMousePos();
    robot.mouseClick('left');
    robot.moveMouse(currentPos.x, currentPos.y);
    
    // Then type the text as a complete string
    robot.typeStringDelayed(text, 0); // 0 delay for immediate typing
    
  } catch (error) {
    console.error('❌ Error typing text:', error.message);
  }
});

  // Handle special keys (NEW FEATURE)
  socket.on('keyboard-key', (data) => {
    try {
      const { key, modifiers = [] } = data;
      console.log(`⌨️ Key press: ${key} with modifiers: [${modifiers.join(', ')}]`);
      
      // Convert modifiers to robotjs format
      const robotModifiers = modifiers.map(mod => {
        switch (mod.toLowerCase()) {
          case 'ctrl': return 'control';
          case 'cmd': return 'command';
          case 'alt': return 'alt';
          case 'shift': return 'shift';
          default: return mod;
        }
      });
      
      robot.keyTap(key, robotModifiers);
      
    } catch (error) {
      console.error('❌ Error pressing key:', error.message);
    }
  });

  // Handle volume control (NEW FEATURE)
  socket.on('volume-control', (data) => {
    try {
      const { action, amount = 1 } = data;
      console.log(`🔊 Volume ${action} by ${amount}`);
      
      // Cross-platform volume control
      if (process.platform === 'win32') {
        // Windows volume control
        switch (action) {
          case 'up':
            for (let i = 0; i < amount; i++) {
              robot.keyTap('audio_vol_up');
            }
            break;
          case 'down':
            for (let i = 0; i < amount; i++) {
              robot.keyTap('audio_vol_down');
            }
            break;
          case 'mute':
            robot.keyTap('audio_mute');
            break;
        }
      } else if (process.platform === 'darwin') {
        // macOS volume control
        switch (action) {
          case 'up':
            for (let i = 0; i < amount; i++) {
              robot.keyTap('f12'); // Volume up on Mac
            }
            break;
          case 'down':
            for (let i = 0; i < amount; i++) {
              robot.keyTap('f11'); // Volume down on Mac
            }
            break;
          case 'mute':
            robot.keyTap('f10'); // Mute on Mac
            break;
        }
      } else {
        // Linux volume control (using amixer command simulation)
        switch (action) {
          case 'up':
            robot.keyTap('audio_vol_up');
            break;
          case 'down':
            robot.keyTap('audio_vol_down');
            break;
          case 'mute':
            robot.keyTap('audio_mute');
            break;
        }
      }
      
    } catch (error) {
      console.error('❌ Error controlling volume:', error.message);
    }
  });

  // Handle media controls (BONUS FEATURE)
  socket.on('media-control', (data) => {
    try {
      const { action } = data;
      console.log(`🎵 Media ${action}`);
      
      switch (action) {
        case 'play-pause':
          robot.keyTap('audio_play');
          break;
        case 'next':
          robot.keyTap('audio_next');
          break;
        case 'previous':
          robot.keyTap('audio_prev');
          break;
        case 'stop':
          robot.keyTap('audio_stop');
          break;
      }
      
    } catch (error) {
      console.error('❌ Error controlling media:', error.message);
    }
  });

  // Handle client disconnect
  socket.on('disconnect', (reason) => {
    connectedClients.delete(socket.id);
    console.log(`📱 Client disconnected: ${socket.id} (Reason: ${reason}) (Total: ${connectedClients.size})`);
  });

  // Send confirmation that client is connected
  socket.emit('connected', {
    message: 'Successfully connected to remote mouse server',
    clientId: socket.id,
    timestamp: new Date().toISOString()
  });
});

// Error handling
io.on('error', (error) => {
  console.error('❌ Socket.io error:', error);
});

server.on('error', (error) => {
  console.error('❌ Server error:', error);
});

// Start the server
server.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 Remote Mouse Server Started');
  console.log('================================');
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🌐 Server accessible at: http://0.0.0.0:${PORT}`);
  
  // Get and display local IP addresses
  import('os').then(os => {
    const networkInterfaces = os.networkInterfaces();
    console.log('\n📱 Connect your mobile app to one of these IPs:');
    
    Object.keys(networkInterfaces).forEach(interfaceName => {
      const interfaces = networkInterfaces[interfaceName];
      if (interfaces) {
        interfaces.forEach(netInterface => {
          if (netInterface.family === 'IPv4' && !netInterface.internal) {
            console.log(`   • ${netInterface.address}:${PORT}`);
          }
        });
      }
    });
  });
  
  console.log('\n🎯 Supported events:');
  console.log('   • mouse-move: { dx, dy }');
  console.log('   • mouse-click: "left" | "right" | "middle"');
  console.log('   • mouse-double-click: (no data)');
  console.log('   • mouse-scroll: { direction, delta }');
  console.log('   • screen-toggle: (no data)');
  console.log('   • keyboard-type: { text }');
  console.log('   • keyboard-key: { key, modifiers }');
  console.log('   • volume-control: { action, amount }');
  console.log('   • media-control: { action }');
  console.log('================================\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  server.close(() => {
    console.log('✅ Server closed successfully');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down...');
  server.close(() => {
    console.log('✅ Server closed successfully');
    process.exit(0);
  });
});
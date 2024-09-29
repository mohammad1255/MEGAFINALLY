const { spawn } = require('child_process');

// Start the Flask app
const flask = spawn('python', ['python/message.py'], {
    stdio: 'inherit', // This will log output to the console
    shell: true,
});

// Start the Telegram bot
const bot = spawn('node', ['js/main.js'], {
    stdio: 'inherit', // This will log output to the console
    shell: true,
});
const axios = require('axios');

axios.get('https://httpbin.org/ip')
  .then((response) => {
    console.log("Server's public IP address is:", response.data.origin);
  })
  .catch((error) => {
    console.error("Error retrieving IP address:", error);
  });

// Handle exit events
flask.on('exit', (code) => {
    console.log(`Flask app exited with code ${code}`);
});

bot.on('exit', (code) => {
    console.log(`Telegram bot exited with code ${code}`);
});


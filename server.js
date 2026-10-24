// ERAS entry point. Start with: npm start
const { createApp } = require('./src/app');

const { app, config, close } = createApp();

const server = app.listen(config.port, () => {
  console.log(`ERAS demo server running at http://localhost:${config.port}`);
  console.log(`Database: ${config.dbPath}`);
  console.log('DEMONSTRATION PROTOTYPE – simulated data only. No real police or hospitals are contacted.');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${config.port} is already in use. Stop the other program or set PORT in .env.`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

function shutdown() {
  close(); // ends live connections so the server can stop
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

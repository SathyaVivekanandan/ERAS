// Server-Sent Events hub: pushes live updates to open dashboards.
// Dashboards also poll, so a dropped connection never loses data (the database is the source of truth).

class EventHub {
  constructor() {
    this.clients = new Set();
    this.heartbeat = setInterval(() => {
      for (const c of this.clients) c.res.write(': heartbeat\n\n');
    }, 25000);
    this.heartbeat.unref();
  }

  add(req, res, user) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    const client = { res, user };
    this.clients.add(client);
    req.on('close', () => this.clients.delete(client));
    this.send(client, 'connected', { user: user.username, at: new Date().toISOString() });
  }

  send(client, event, data) {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  // Sends to every client whose user matches `filter`. Returns how many received it.
  publish(event, data, filter = () => true) {
    let delivered = 0;
    for (const client of this.clients) {
      if (!filter(client.user)) continue;
      try {
        this.send(client, event, data);
        delivered++;
      } catch {
        this.clients.delete(client);
      }
    }
    return delivered;
  }

  close() {
    clearInterval(this.heartbeat);
    for (const c of this.clients) c.res.end();
    this.clients.clear();
  }
}

module.exports = { EventHub };

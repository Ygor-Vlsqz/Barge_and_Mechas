export const Net = {
  peer: null, conns: new Map(), hostConn: null, myId: null,
  onInput: null, onState: null, onEvent: null,

  host(code) {
    this.peer = new Peer("mbarge-" + code);
    this.peer.on("open", () => this.onEvent?.({ t: "ready", code }));
    this.peer.on("error", e => this.onEvent?.({ t: "error", msg: e.type }));
    this.peer.on("connection", c => {
      c.on("open", () => {
        if (this.conns.size >= 7) { c.send({ t: "full" }); setTimeout(() => c.close(), 300); return; }
        this.conns.set(c.peer, c);
      });
      c.on("data", d => d.t === "input" ? this.onInput?.(c.peer, d) : this.onEvent?.({ ...d, id: c.peer }));
      c.on("close", () => { if (this.conns.delete(c.peer)) this.onEvent?.({ t: "leave", id: c.peer }); });
    });
  },

  join(code, name) {
    this.peer = new Peer();
    this.peer.on("error", e => this.onEvent?.({ t: "error", msg: e.type }));
    this.peer.on("open", id => {
      this.myId = id;
      const c = this.hostConn = this.peer.connect("mbarge-" + code);
      c.on("open", () => c.send({ t: "hello", name }));
      c.on("data", d => d.t === "state" ? this.onState?.(d) : this.onEvent?.(d));
      c.on("close", () => this.onEvent?.({ t: "hostLeft" }));
    });
  },

  broadcast(m) { this.conns.forEach(c => c.open && c.send(m)); },
  sendTo(id, m) { const c = this.conns.get(id); c?.open && c.send(m); },
  sendInput(i) { this.hostConn?.open && this.hostConn.send({ ...i, t: "input" }); },
  send(m) { this.hostConn?.open && this.hostConn.send(m); }
};

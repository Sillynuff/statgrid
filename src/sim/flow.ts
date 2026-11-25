// Min-cost flow (successive shortest paths med SPFA). Brukes som forenklet
// markedsklarering: billigste produksjon dekker forbruket, begrenset av linjekapasitet.
// Augmenterer kun så lenge stien har negativ kostnad (dvs. det lønner seg å levere).
export class MinCostFlow {
  n: number;
  head: Int32Array;
  to: number[] = [];
  next: number[] = [];
  cap: number[] = [];
  cost: number[] = [];
  flow: number[] = [];

  constructor(n: number) {
    this.n = n;
    this.head = new Int32Array(n).fill(-1);
  }

  addEdge(u: number, v: number, cap: number, cost: number): number {
    const e = this.to.length;
    this.to.push(v); this.cap.push(cap); this.cost.push(cost); this.flow.push(0); this.next.push(this.head[u]); this.head[u] = e;
    this.to.push(u); this.cap.push(0); this.cost.push(-cost); this.flow.push(0); this.next.push(this.head[v]); this.head[v] = e + 1;
    return e;
  }

  solve(s: number, t: number, maxIter = 4000): { flow: number; cost: number } {
    const n = this.n;
    const dist = new Float64Array(n);
    const inq = new Uint8Array(n);
    const prevE = new Int32Array(n);
    const queue = new Int32Array(n * 4 + 16);
    let total = 0, totalCost = 0;
    for (let iter = 0; iter < maxIter; iter++) {
      dist.fill(Infinity); prevE.fill(-1);
      dist[s] = 0;
      let qh = 0, qt = 0, qn = 0;
      queue[qt] = s; qt = (qt + 1) % queue.length; qn++; inq[s] = 1;
      let relax = 0;
      while (qn > 0) {
        const u = queue[qh]; qh = (qh + 1) % queue.length; qn--; inq[u] = 0;
        for (let e = this.head[u]; e !== -1; e = this.next[e]) {
          if (this.cap[e] - this.flow[e] > 1e-7) {
            const v = this.to[e];
            const nd = dist[u] + this.cost[e];
            if (nd < dist[v] - 1e-9) {
              dist[v] = nd; prevE[v] = e;
              if (!inq[v]) { inq[v] = 1; queue[qt] = v; qt = (qt + 1) % queue.length; qn++; }
            }
          }
        }
        if (++relax > 400000) break; // sikkerhetsnett
      }
      if (!(dist[t] < -1e-9)) break;
      let f = Infinity;
      for (let v = t; v !== s; v = this.to[prevE[v] ^ 1]) {
        const e = prevE[v];
        f = Math.min(f, this.cap[e] - this.flow[e]);
      }
      if (!(f > 1e-7) || !isFinite(f)) break;
      for (let v = t; v !== s; v = this.to[prevE[v] ^ 1]) {
        const e = prevE[v];
        this.flow[e] += f; this.flow[e ^ 1] -= f;
      }
      total += f; totalCost += f * dist[t];
    }
    return { flow: total, cost: totalCost };
  }

  edgeFlow(e: number) {
    return this.flow[e];
  }
}

// utils/buffer.js — Ring buffer + multi-channel buffer for streaming EEG data.
//
// RingBuffer<Float32Array> — fixed-capacity circular buffer of scalars.
//   • push(v)              append a single sample
//   • pushArray(arr)       append a JS array / typed array
//   • latest(n, out?)      copy the most recent n samples (chronological order)
//                          into `out` (a Float32Array of length n); allocates if
//                          not provided. Pads with 0 on the left if buffer isn't
//                          full yet.
//   • clear()              reset
//
// MultiChannelBuffer — one RingBuffer per EEG channel. Accepts chunks shaped
// [n_channels][n_samples], rejects out-of-order timestamps per the spec.

(function () {
  class RingBuffer {
    constructor(capacity) {
      this.capacity = capacity | 0;
      this.buf = new Float32Array(this.capacity);
      this.writeIdx = 0;
      this.size = 0;
    }
    push(v) {
      this.buf[this.writeIdx] = v;
      this.writeIdx = (this.writeIdx + 1) % this.capacity;
      if (this.size < this.capacity) this.size++;
    }
    pushArray(arr) {
      const n = arr.length;
      for (let i = 0; i < n; i++) {
        this.buf[this.writeIdx] = arr[i];
        this.writeIdx = (this.writeIdx + 1) % this.capacity;
      }
      this.size = Math.min(this.capacity, this.size + n);
    }
    latest(n, out) {
      if (!out || out.length !== n) out = new Float32Array(n);
      const avail = Math.min(n, this.size);
      const pad = n - avail;
      for (let i = 0; i < pad; i++) out[i] = 0;
      const start = (this.writeIdx - avail + this.capacity) % this.capacity;
      for (let i = 0; i < avail; i++) {
        out[pad + i] = this.buf[(start + i) % this.capacity];
      }
      return out;
    }
    clear() { this.writeIdx = 0; this.size = 0; }
  }

  class MultiChannelBuffer {
    constructor(nChannels, capacity) {
      this.nChannels = nChannels;
      this.capacity = capacity;
      this.channels = new Array(nChannels);
      for (let c = 0; c < nChannels; c++) this.channels[c] = new RingBuffer(capacity);
      this.lastTimestamp = -Infinity;
      // Per-channel single-sample latest cache (for instantaneous readouts).
      this.lastValues = new Float32Array(nChannels);
    }
    // data shape: [n_channels][n_samples]. Returns false if rejected (out of order).
    pushChunk(data, timestamp) {
      if (typeof timestamp === 'number' && timestamp < this.lastTimestamp) {
        // Out-of-order chunk per spec § 6.4 — drop.
        return false;
      }
      if (typeof timestamp === 'number') this.lastTimestamp = timestamp;
      const n = Math.min(data.length, this.nChannels);
      for (let c = 0; c < n; c++) {
        const row = data[c];
        if (!row || row.length === 0) continue;
        this.channels[c].pushArray(row);
        this.lastValues[c] = row[row.length - 1];
      }
      return true;
    }
    latest(channelIdx, n, out) {
      return this.channels[channelIdx].latest(n, out);
    }
    clear() {
      for (let c = 0; c < this.nChannels; c++) this.channels[c].clear();
      this.lastTimestamp = -Infinity;
      this.lastValues.fill(0);
    }
  }

  window.RingBuffer = RingBuffer;
  window.MultiChannelBuffer = MultiChannelBuffer;
})();

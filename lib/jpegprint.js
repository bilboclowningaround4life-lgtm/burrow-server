"use strict";

// a picture's fingerprint, to know a masterpiece again when it comes back
// re-encoded (lib/masterpieces.js): the Art Studio paints a saved .ajart
// again a little differently, so the JPEG's bytes differ while every 8 by 8
// block's average stays within a fraction of a step.
//
// the fingerprint is the average of each block, per component, read from
// the JPEG's DC coefficients alone (no inverse DCT): a baseline JPEG (what
// the Art Studio writes) with no subsampling and no restart markers. any
// other JPEG has none, and only its exact bytes are known again.
//
// layout: [width (uint16), height (uint16), components (uint8)], then a byte
// per block and component, block by block in rows.

const HEADER = 5;
const SAME_WITHIN = 2; // of 255, per block: a mark of a few pixels moves its block by more
const THUMB = 16; // the thumbnail's side, for finding candidates quickly

// a Huffman table as JPEG decoders keep it: per code length the smallest
// and largest code and where its values start.
const huffmanTable = (counts, values) => {
  const minCode = new Int32Array(17);
  const maxCode = new Int32Array(18).fill(-1);
  const valPtr = new Int32Array(17);
  let code = 0;
  let k = 0;
  for (let length = 1; length <= 16; length++) {
    valPtr[length] = k;
    minCode[length] = code;
    code += counts[length - 1];
    k += counts[length - 1];
    maxCode[length] = counts[length - 1] ? code - 1 : -1;
    code <<= 1;
  }
  maxCode[17] = 0x7FFFFFFF;
  return {minCode, maxCode, valPtr, values};
};

// the fingerprint of a JPEG, or null.
const fingerprint = buf => {
  try {
    return read(buf);
  }
  catch (err) {
    return null;
  }
};

const read = buf => {
  const tables = {};
  const quant = {};
  let frame = null;
  let scan = null;
  let at = 2;
  while (!scan) {
    if (at + 4 > buf.length || buf[at] !== 0xFF) {
      return null;
    }
    const marker = buf[at + 1];
    const length = buf.readUInt16BE(at + 2);
    const body = buf.subarray(at + 4, at + 2 + length);
    if (marker === 0xDB) {
      for (let p = 0; p + 65 <= body.length; p += 65) {
        if (body[p] >> 4) {
          return null; // 16-bit tables: not the Art Studio's
        }
        quant[body[p] & 15] = body[p + 1];
      }
    }
    else if (marker === 0xC4) {
      for (let p = 0; p + 17 <= body.length;) {
        const counts = body.subarray(p + 1, p + 17);
        const total = counts.reduce((sum, count) => sum + count, 0);
        tables[(body[p] >> 4 ? "ac" : "dc") + (body[p] & 15)] = huffmanTable(counts, body.subarray(p + 17, p + 17 + total));
        p += 17 + total;
      }
    }
    else if (marker === 0xC0 || marker === 0xC1) {
      const comps = body[5];
      frame = {height: body.readUInt16BE(1), width: body.readUInt16BE(3), comps: []};
      for (let c = 0; c < comps; c++) {
        if (body[7 + c * 3] !== 0x11) {
          return null; // subsampled
        }
        frame.comps.push(body[8 + c * 3]);
      }
    }
    else if (marker === 0xDD || (marker >= 0xC2 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC)) {
      return null; // restart markers, progressive, lossless or arithmetic
    }
    else if (marker === 0xDA) {
      scan = [];
      for (let c = 0; c < body[0]; c++) {
        scan.push({dc: tables[`dc${body[2 + c * 2] >> 4}`], ac: tables[`ac${body[2 + c * 2] & 15}`]});
      }
    }
    at += 2 + length;
  }
  if (!frame || frame.width < 1 || frame.height < 1 || scan.length !== frame.comps.length || scan.length < 1 || scan.length > 3
    || scan.some(table => !table.dc || !table.ac) || frame.comps.some(id => quant[id] === undefined)) {
    return null;
  }

  // the entropy-coded data, its 0xFF bytes followed by a stuffed 0x00
  let pos = at;
  let bits = 0;
  let left = 0;
  const bit = () => {
    if (left === 0) {
      if (pos >= buf.length) {
        throw new Error("ran out");
      }
      bits = buf[pos++];
      if (bits === 0xFF) {
        if (buf[pos] !== 0) {
          throw new Error("marker in the data");
        }
        pos++;
      }
      left = 8;
    }
    left--;
    return (bits >> left) & 1;
  };
  const decode = table => {
    let code = bit();
    let length = 1;
    while (code > table.maxCode[length]) {
      code = (code << 1) | bit();
      if (++length > 16) {
        throw new Error("bad code");
      }
    }
    return table.values[table.valPtr[length] + code - table.minCode[length]];
  };
  const receive = size => {
    let value = 0;
    for (let i = 0; i < size; i++) {
      value = (value << 1) | bit();
    }
    return value < 1 << (size - 1) ? value - (1 << size) + 1 : value;
  };

  const across = Math.ceil(frame.width / 8);
  const down = Math.ceil(frame.height / 8);
  const comps = scan.length;
  const out = Buffer.alloc(HEADER + across * down * comps);
  out.writeUInt16BE(frame.width, 0);
  out.writeUInt16BE(frame.height, 2);
  out[4] = comps;
  const predicted = new Int32Array(comps);
  for (let block = 0; block < across * down; block++) {
    for (let c = 0; c < comps; c++) {
      const size = decode(scan[c].dc);
      predicted[c] += size ? receive(size) : 0;
      // the DC coefficient is eight times the block's average, less 128
      const average = Math.round(predicted[c] * quant[frame.comps[c]] / 8 + 128);
      out[HEADER + block * comps + c] = Math.max(0, Math.min(255, average));
      for (let k = 1; k < 64;) {
        const runSize = decode(scan[c].ac);
        if ((runSize & 15) === 0) {
          if (runSize >> 4 !== 15) {
            break; // end of block
          }
          k += 16;
          continue;
        }
        k += runSize >> 4;
        receive(runSize & 15);
        k++;
      }
    }
  }
  return out;
};

// the first component (brightness) in THUMB by THUMB, to find candidates
// among many fingerprints before comparing whole ones.
const thumbnail = print => {
  const across = Math.ceil(print.readUInt16BE(0) / 8);
  const down = Math.ceil(print.readUInt16BE(2) / 8);
  const comps = print[4];
  const sums = new Float64Array(THUMB * THUMB);
  const counts = new Float64Array(THUMB * THUMB);
  for (let y = 0; y < down; y++) {
    for (let x = 0; x < across; x++) {
      const cell = Math.floor(y * THUMB / down) * THUMB + Math.floor(x * THUMB / across);
      sums[cell] += print[HEADER + (y * across + x) * comps];
      counts[cell]++;
    }
  }
  return Buffer.from(sums.map((sum, cell) => (counts[cell] ? Math.round(sum / counts[cell]) : 0)));
};

// could these two be the same picture? (thumbnails: a cheap first look)
const thumbnailsClose = (one, other) => one.length === other.length && one.every((value, i) => Math.abs(value - other[i]) <= SAME_WITHIN);

// the same picture: the same size, and no block further apart than a step or two.
const samePicture = (one, other) => {
  if (!one || !other || one.length !== other.length || one.compare(other, 0, HEADER, 0, HEADER) !== 0) {
    return false;
  }
  for (let i = HEADER; i < one.length; i++) {
    if (Math.abs(one[i] - other[i]) > SAME_WITHIN) {
      return false;
    }
  }
  return true;
};

module.exports = {fingerprint, thumbnail, thumbnailsClose, samePicture};

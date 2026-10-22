"use strict";

// The style travels with a chat line, rather than with an avatar-create
// packet, so a new choice takes effect immediately and is seen by everybody
// who sees that line.  Keep it small and entirely server-generated: clients
// never get to choose the fields sent to other players.
const DEFAULT = Object.freeze({background: "ffffff", accent: "dfe8ff", text: "445559", border: "9aabb0", opacity: 75,
  animation: "none", speed: 100, gradient: "linear", angle: 45, strength: 100, outline: 1,
  stops: "ffffff:0;dfe8ff:100"});
const ANIMATIONS = new Set(["none", "pulse", "shimmer", "flow", "rainbow"]);
const GRADIENTS = new Set(["solid", "linear", "radial"]);
const COLOR = /^[0-9a-f]{6}$/i;

const color = (value, fallback) => typeof value === "string" && COLOR.test(value) ? value.toLowerCase() : fallback;
const number = (value, fallback, low, high) => Number.isInteger(value) && value >= low && value <= high ? value : fallback;
const direction = value => {
  const angle = number(value, DEFAULT.angle, 0, 315);
  return angle % 45 === 0 ? angle : DEFAULT.angle;
};

const stops = (value, background, accent) => {
  if (typeof value === "string") {
    const parsed = value.split(";").map(stop => {
      const match = /^([0-9a-f]{6}):(100|[1-9]?\d)$/i.exec(stop);
      return match ? {color: match[1].toLowerCase(), position: Number(match[2])} : null;
    });
    if (parsed.length >= 2 && parsed.length <= 5 && parsed.every(Boolean)
      && parsed[0].position === 0 && parsed.at(-1).position === 100
      && parsed.every((stop, index) => index === 0 || stop.position > parsed[index - 1].position)) {
      return parsed.map(stop => `${stop.color}:${stop.position}`).join(";");
    }
  }
  return `${background}:0;${accent}:100`;
};

const normalize = value => {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  let background = color(source.background, DEFAULT.background);
  let accent = color(source.accent, DEFAULT.accent);
  const gradientStops = stops(source.stops, background, accent);
  const stopParts = gradientStops.split(";");
  background = stopParts[0].slice(0, 6);
  accent = stopParts.at(-1).slice(0, 6);
  return {
    background,
    accent,
    text: color(source.text, DEFAULT.text),
    border: color(source.border, DEFAULT.border),
    opacity: number(source.opacity, DEFAULT.opacity, 25, 100),
    animation: ANIMATIONS.has(source.animation) ? source.animation : DEFAULT.animation,
    speed: number(source.speed, DEFAULT.speed, 40, 300),
    gradient: GRADIENTS.has(source.gradient) ? source.gradient : DEFAULT.gradient,
    angle: direction(source.angle),
    strength: number(source.strength, DEFAULT.strength, 0, 100),
    outline: number(source.outline, DEFAULT.outline, 0, 4),
    stops: gradientStops,
  };
};

const same = (one, two) => Object.keys(DEFAULT).every(key => one[key] === two[key]);

// `normalize` is intentionally forgiving when old account data is loaded.
// Incoming editor requests are not: every field must already be canonical.
const valid = value => Boolean(value) && typeof value === "object" && !Array.isArray(value)
  && Object.keys(DEFAULT).every(key => value[key] === normalize(value)[key]);

const fields = value => {
  const style = normalize(value);
  return [style.background, style.accent, style.text, style.border, style.opacity, style.animation, style.speed,
    style.gradient, style.angle, style.strength, style.outline, style.stops];
};

// Twelve comma-separated, URL-safe fields; empty means the original game bubble.
const packet = value => {
  const style = normalize(value);
  return same(style, DEFAULT) ? "" : fields(style).join(",");
};

module.exports = {DEFAULT, normalize, valid, fields, packet};

export function applicationNow() {
  return new Date().toISOString();
}

export function addMilliseconds(timestamp, milliseconds) {
  return new Date(Date.parse(timestamp) + milliseconds).toISOString();
}

export function addSeconds(timestamp, seconds) {
  return addMilliseconds(timestamp, seconds * 1000);
}

export function addHours(timestamp, hours) {
  return addMilliseconds(timestamp, hours * 60 * 60 * 1000);
}

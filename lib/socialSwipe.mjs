export function swipeAxis(dx, dy) {
  const horizontal = Math.abs(dx);
  const vertical = Math.abs(dy);
  if (Math.max(horizontal, vertical) < 10) return null;

  // Do not lock an imprecise diagonal gesture too early. A touch often starts
  // with a few vertical pixels before the horizontal intent becomes clear.
  if (horizontal > vertical * 1.18) return "horizontal";
  if (vertical > horizontal * 1.12) return "vertical";
  return null;
}

export function swipeDestination({ index, count, dx, dy, elapsed, width, velocity = 0 }) {
  if (swipeAxis(dx, dy) !== "horizontal") return index;
  const distance = Math.abs(dx);
  const distanceThreshold = Math.min(84, Math.max(56, width * .18));
  const averageVelocity = distance / Math.max(1, elapsed);
  // A flick only counts in the direction of travel: pulling the finger back
  // at the end of a short drag cancels the change instead of committing it.
  const flickVelocity = Math.sign(velocity) === Math.sign(dx) ? Math.abs(velocity) : 0;
  const committed = distance >= distanceThreshold
    || (distance >= 28 && Math.max(flickVelocity, averageVelocity) > .38);
  if (!committed) return index;
  return Math.max(0, Math.min(count - 1, index + (dx < 0 ? 1 : -1)));
}

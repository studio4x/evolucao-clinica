import assert from 'node:assert/strict';
import { resolveHorizontalSwipe } from '../src/utils/horizontalSwipe';

assert.equal(resolveHorizontalSwipe({
  deltaX: -31,
  deltaY: 36,
  velocityX: -0.08,
}), 'next', 'accepts a natural diagonal swipe without requiring a full-width drag');

assert.equal(resolveHorizontalSwipe({
  deltaX: 30,
  deltaY: -20,
  velocityX: 0.07,
}), 'previous', 'recognizes a distance-based swipe in the opposite direction');

assert.equal(resolveHorizontalSwipe({
  deltaX: -18,
  deltaY: 9,
  velocityX: -0.24,
}), 'next', 'recognizes a short, intentional flick by velocity');

assert.equal(resolveHorizontalSwipe({
  deltaX: -18,
  deltaY: 9,
  velocityX: -0.05,
}), null, 'does not turn a short, slow movement into navigation');

assert.equal(resolveHorizontalSwipe({
  deltaX: 24,
  deltaY: 70,
  velocityX: 0.35,
}), null, 'preserves strongly vertical gestures for page scrolling');

assert.equal(resolveHorizontalSwipe({
  deltaX: 7,
  deltaY: 2,
  velocityX: 0.5,
}), null, 'ignores tiny touch jitter');

console.log('Horizontal swipe tests passed.');

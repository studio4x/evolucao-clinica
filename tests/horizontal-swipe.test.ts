import assert from 'node:assert/strict';
import { resolveHorizontalSwipe } from '../src/utils/horizontalSwipe';

assert.equal(resolveHorizontalSwipe({
  deltaX: -15,
  deltaY: 12,
}), 'next', 'a short natural drag is enough to advance the tab');

assert.equal(resolveHorizontalSwipe({
  deltaX: 14,
  deltaY: -8,
}), 'previous', 'the same short drag works in the opposite direction');

assert.equal(resolveHorizontalSwipe({
  deltaX: -13,
  deltaY: 4,
}), null, 'keeps a small margin against accidental touch jitter');

assert.equal(resolveHorizontalSwipe({
  deltaX: 18,
  deltaY: 40,
}), null, 'preserves strongly vertical gestures for page scrolling');

assert.equal(resolveHorizontalSwipe({
  deltaX: 7,
  deltaY: 2,
}), null, 'ignores tiny touch jitter');

console.log('Horizontal swipe tests passed.');

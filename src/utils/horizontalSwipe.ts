export type HorizontalSwipeDirection = 'next' | 'previous';

type HorizontalSwipeMeasurement = {
  deltaX: number;
  deltaY: number;
  velocityX: number;
};

const SWIPE_DISTANCE_PX = 28;
const FLICK_DISTANCE_PX = 16;
const FLICK_VELOCITY_PX_PER_MS = 0.15;
const HORIZONTAL_AXIS_TOLERANCE = 0.65;

export const resolveHorizontalSwipe = ({
  deltaX,
  deltaY,
  velocityX,
}: HorizontalSwipeMeasurement): HorizontalSwipeDirection | null => {
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);
  const hasHorizontalIntent = absX >= absY * HORIZONTAL_AXIS_TOLERANCE;
  const hasEnoughDistance = absX >= SWIPE_DISTANCE_PX;
  const isFastFlick = absX >= FLICK_DISTANCE_PX
    && Math.abs(velocityX) >= FLICK_VELOCITY_PX_PER_MS
    && Math.sign(velocityX) === Math.sign(deltaX);

  if (!hasHorizontalIntent || (!hasEnoughDistance && !isFastFlick)) {
    return null;
  }

  return deltaX < 0 ? 'next' : 'previous';
};

export const hasHorizontalSwipeIntent = (deltaX: number, deltaY: number) => {
  const absX = Math.abs(deltaX);
  return absX >= 8 && absX >= Math.abs(deltaY) * HORIZONTAL_AXIS_TOLERANCE;
};

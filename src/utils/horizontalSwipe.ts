export type HorizontalSwipeDirection = 'next' | 'previous';

type HorizontalSwipeMeasurement = {
  deltaX: number;
  deltaY: number;
};

const SHORT_SWIPE_DISTANCE_PX = 14;
const HORIZONTAL_AXIS_TOLERANCE = 0.65;

export const resolveHorizontalSwipe = ({
  deltaX,
  deltaY,
}: HorizontalSwipeMeasurement): HorizontalSwipeDirection | null => {
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);
  const hasHorizontalIntent = absX >= absY * HORIZONTAL_AXIS_TOLERANCE;

  if (!hasHorizontalIntent || absX < SHORT_SWIPE_DISTANCE_PX) {
    return null;
  }

  return deltaX < 0 ? 'next' : 'previous';
};

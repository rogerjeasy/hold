import { resizeFor } from '@/components/camera/downscale';

describe('downscaling a photograph', () => {
  it('shrinks the long edge to the limit and keeps the shape', () => {
    expect(resizeFor({ width: 3024, height: 4032 }, 2560)).toEqual({ height: 2560 });
    expect(resizeFor({ width: 4032, height: 3024 }, 2560)).toEqual({ width: 2560 });
  });

  it('leaves a photograph that is already small enough as it is', () => {
    expect(resizeFor({ width: 1920, height: 2560 }, 2560)).toBeUndefined();
  });
});

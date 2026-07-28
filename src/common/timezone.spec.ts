import { salonWallClockToUtc } from './timezone';

// Africa/Johannesburg is UTC+2 year-round (no DST).
describe('salonWallClockToUtc', () => {
  it('maps salon wall-clock hours to UTC instants', () => {
    expect(salonWallClockToUtc(2030, 3, 4, 10).toISOString()).toBe(
      '2030-03-04T08:00:00.000Z',
    );
    expect(salonWallClockToUtc(2030, 3, 4, 17, 30).toISOString()).toBe(
      '2030-03-04T15:30:00.000Z',
    );
  });

  it('starts the salon calendar day at local midnight', () => {
    expect(salonWallClockToUtc(2030, 3, 4).toISOString()).toBe(
      '2030-03-03T22:00:00.000Z',
    );
  });

  it('normalises day overflow, so day + 1 spans month ends', () => {
    expect(salonWallClockToUtc(2030, 3, 32).toISOString()).toBe(
      '2030-03-31T22:00:00.000Z', // 1 April 00:00 SAST
    );
  });
});

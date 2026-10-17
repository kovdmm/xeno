// Lasers are one shared looping hum whose volume follows how many beams are firing.

/** Volume the hum should settle on for a given number of beams (0 when none). */
export const humTarget = (beams: number): number => (beams ? Math.min(0.32, 0.12 + 0.05 * Math.sqrt(beams)) : 0);

/** The hum's volume, easing towards its target so beams starting and stopping do not click. */
export class LaserHum {
  volume = 0;

  /** Advances by dt seconds towards the target for `beams` beams; returns the new volume. */
  update(dt: number, beams: number): number {
    this.volume += (humTarget(beams) - this.volume) * Math.min(1, dt * 8);
    return this.volume;
  }

  reset(): void {
    this.volume = 0;
  }
}

/** Below this the hum is inaudible and the loop is stopped. */
export const HUM_AUDIBLE = 0.005;

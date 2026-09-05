import type { Point3 } from './projection';

export const ORIGIN:Point3={x:-250,y:-170,z:0};
export const GRID_EXTENT=1000;
export const GRID_BACK_EXTENT=150;
// Bound navigation at the midpoint of the fade, before the almost-black tail.
export const GRID_PAN_BOUNDS={
  min:{x:ORIGIN.x-GRID_BACK_EXTENT/2,y:ORIGIN.y-GRID_BACK_EXTENT/2,z:-(300+GRID_EXTENT)/2},
  max:{x:ORIGIN.x+(300+GRID_EXTENT)/2,y:ORIGIN.y+(300+GRID_EXTENT)/2,z:(300+GRID_EXTENT)/2},
};

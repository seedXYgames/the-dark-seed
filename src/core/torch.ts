// Unica geometria del fascio, condivisa da rendering e percezione.
export const TORCH_ANGLE = 2 * Math.atan(Math.tan(1.16 / 2) / 2);
export const TORCH_RANGE = 60;
// Il materiale standard satura con intensità elevate: questa potenza conserva la penombra.
export const TORCH_POWER = 4.2;
export const TORCH_COLOR = [1, 0.965, 0.9] as const;

/** Punto caldo continuo e alone: nessuna corona piatta o anello netto sul bordo. */
export function torchProfile(radius: number): number {
  const r = Math.max(0, radius);
  if (r >= 1) return 0;
  const t = Math.max(0, Math.min(1, (r - 0.58) / 0.42));
  const edge = 1 - t * t * (3 - 2 * t);
  return (0.84 * Math.exp(-4.5 * r * r) + 0.16 * Math.exp(-1.2 * r * r)) * edge;
}

/** Stesso riflettore sulle superfici e nei materiali personalizzati (acqua, fauna e pioggia). */
export const TORCH_PROFILE_GLSL = `
float tdsTorchMask(vec3 offset, vec3 direction) {
  float d=max(length(offset),0.001);
  float c=dot(offset/d,normalize(direction));
  if(c<=0.0) return 0.0;
  float r=sqrt(max(0.0,1.0-c*c))/max(c,0.001)/${Math.tan(TORCH_ANGLE / 2).toFixed(8)};
  float edge=1.0-smoothstep(0.58,1.0,r);
  return (0.84*exp(-4.5*r*r)+0.16*exp(-1.2*r*r))*edge;
}
`;

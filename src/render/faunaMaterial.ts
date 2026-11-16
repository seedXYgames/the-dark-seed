import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer';
import type { SpotLight } from '@babylonjs/core/Lights/spotLight';
import { TORCH_POWER, TORCH_RANGE, TORCH_PROFILE_GLSL } from '../core/torch';

/** Il mantello non è autoilluminante: al buio rimane una sagoma, nel fascio riacquista colore. */
export class FaunaMaterialPlugin extends MaterialPluginBase {
  night = 1;
  constructor(private mat: StandardMaterial) {
    super(mat, 'TdsFauna', 220, {}); this._enable(true);
  }
  override getClassName() { return 'TdsFaunaPlugin'; }
  override getUniforms() {
    return { ubo: [{ name: 'faunaTorchPos', size: 4, type: 'vec4' }, { name: 'faunaTorchDir', size: 4, type: 'vec4' }],
      fragment: 'uniform vec4 faunaTorchPos;\nuniform vec4 faunaTorchDir;\n' };
  }
  override bindForSubMesh(ubo: UniformBuffer) {
    const light = this.mat.getScene().getLightByName('tds.torch') as SpotLight | null;
    light?.computeTransformedInformation();
    const p = light?.transformedPosition ?? light?.position, d = light?.transformedDirection ?? light?.direction;
    ubo.updateFloat4('faunaTorchPos', p?.x ?? 0, p?.y ?? 0, p?.z ?? 0, Math.min(1, (light?.intensity ?? 0) / TORCH_POWER));
    ubo.updateFloat4('faunaTorchDir', d?.x ?? 0, d?.y ?? 0, d?.z ?? 1, this.night);
  }
  override getCustomCode(shaderType: string) {
    if (shaderType !== 'fragment') return null;
    return { CUSTOM_FRAGMENT_DEFINITIONS: TORCH_PROFILE_GLSL, CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
vec3 faunaDelta=vPositionW-faunaTorchPos.xyz;
float faunaDistance=length(faunaDelta);
float faunaLit=clamp(tdsTorchMask(faunaDelta,faunaTorchDir.xyz)*3.0,0.0,1.0)
  *(1.0-smoothstep(${TORCH_RANGE * 0.65}.0,${TORCH_RANGE}.0,faunaDistance))*faunaTorchPos.w;
baseColor.rgb*=mix(1.0,mix(0.012,1.0,faunaLit),faunaTorchDir.w);
` };
  }
}

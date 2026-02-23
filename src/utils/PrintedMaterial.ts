import * as THREE from "three";

/** Creates a matte plastic material with FDM-style layer lines for a 3D-printed look. */
export function createPrintedMaterial(options: {
  color: number;
}): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: options.color,
    roughness: 0.95,
    metalness: 0,
    flatShading: true,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      "varying float vLayerY;\n#include <common>"
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "vLayerY = position.y;\n#include <begin_vertex>"
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      "varying float vLayerY;\n#include <common>"
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <dithering_fragment>",
      `
      float layer = fract(vLayerY * 10.0);
      float line = smoothstep(0.08, 0.0, layer) + smoothstep(0.92, 1.0, layer);
      gl_FragColor.rgb *= 1.0 - 0.32 * line;
      #include <dithering_fragment>
      `
    );
  };
  return material;
}

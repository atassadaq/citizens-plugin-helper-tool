import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// Browsers cap simultaneous WebGL contexts (commonly ~8-16). A roster grid of up to
// ~40 citizens must NOT spin up one live canvas per citizen - that silently starts
// losing the oldest contexts. Instead: one shared, reused renderer that snapshots
// each model to a PNG data URL, which is then displayed as a plain <img>.

const SIZE = 128;
let renderer: THREE.WebGLRenderer | null = null;
const loader = new GLTFLoader();

function getRenderer(): THREE.WebGLRenderer {
  if (!renderer) {
    const canvas = document.createElement("canvas");
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, preserveDrawingBuffer: true, antialias: true });
    renderer.setSize(SIZE, SIZE);
  }
  return renderer;
}

function loadGltf(gltfText: string): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    loader.parse(gltfText, "", (gltf) => resolve(gltf.scene), reject);
  });
}

export async function renderThumbnail(gltfText: string): Promise<string> {
  const r = getRenderer();
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(1, 2, 1);
  scene.add(dir);

  const model = await loadGltf(gltfText);
  scene.add(model);

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, maxDim * 100);
  const distance = maxDim * 2.2;
  camera.position.set(center.x + distance, center.y + distance * 0.6, center.z + distance);
  camera.lookAt(center);

  r.render(scene, camera);
  const dataUrl = r.domElement.toDataURL("image/png");

  // Dispose to avoid leaking memory across dozens of thumbnails per region.
  model.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      const material = obj.material as THREE.Material | THREE.Material[];
      (Array.isArray(material) ? material : [material]).forEach((m) => m.dispose());
    }
  });
  scene.clear();

  return dataUrl;
}

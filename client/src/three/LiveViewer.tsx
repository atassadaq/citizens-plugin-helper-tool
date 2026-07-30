import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type Props = {
  gltfText: string | null;
  width?: number;
  height?: number;
};

// Persistent, interactive viewer used only in the citizen editor (one at a time),
// unlike the roster grid's shared-renderer snapshot strategy.
export function LiveViewer({ gltfText, width = 360, height = 360 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<THREE.Object3D | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);

  useEffect(() => {
    const container = containerRef.current!;
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(1, 2, 1);
    scene.add(dir);

    const camera = new THREE.PerspectiveCamera(35, width / height, 0.01, 10000);
    camera.position.set(150, 100, 150);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    let raf = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, [width, height]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !gltfText) return;

    if (modelRef.current) {
      scene.remove(modelRef.current);
      modelRef.current.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const material = obj.material as THREE.Material | THREE.Material[];
          (Array.isArray(material) ? material : [material]).forEach((m) => m.dispose());
        }
      });
      modelRef.current = null;
    }

    const loader = new GLTFLoader();
    loader.parse(gltfText, "", (gltf) => {
      scene.add(gltf.scene);
      modelRef.current = gltf.scene;
    });
  }, [gltfText]);

  return <div ref={containerRef} style={{ width, height }} />;
}

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type ClipInfo = {
  // Seconds for one full cycle.
  duration: number;
  // OSRS animations are baked one morph target per frame, so the keyframe count is the
  // frame count - which is what the scrubber steps through.
  frameCount: number;
  frameTimes: number[];
};

type Props = {
  gltfText: string | null;
  width?: number;
  height?: number;
  // Playback controls. Inert when the loaded GLTF carries no animation.
  paused?: boolean;
  timeScale?: number;
  // Non-null holds the clip at that time (seconds) instead of advancing it - the frame
  // scrubber drives this while paused.
  seekTime?: number | null;
  // Fires on every load, with null when the model came back with no animation track.
  onClipLoaded?: (clip: ClipInfo | null) => void;
};

// Persistent, interactive viewer used only in the citizen editor (one at a time),
// unlike the roster grid's shared-renderer snapshot strategy.
//
// Modeled after runemonk's entity viewer: left-drag orbits, scroll zooms, right-drag
// pans - all standard OrbitControls behavior - and the camera auto-frames whatever
// model is loaded (models vary wildly in size/offset, so a fixed camera pose would
// clip or dwarf most of them).
export function LiveViewer({
  gltfText,
  width = 480,
  height = 480,
  paused = false,
  timeScale = 1,
  seekTime = null,
  onClipLoaded,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<THREE.Object3D | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionRef = useRef<THREE.AnimationAction | null>(null);

  // Read by the render loop, which is created once on mount and so can't close over
  // these props directly.
  const playback = useRef({ paused, timeScale });
  playback.current = { paused, timeScale };
  const onClipLoadedRef = useRef(onClipLoaded);
  onClipLoadedRef.current = onClipLoaded;

  useEffect(() => {
    const container = containerRef.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1e1e22);
    sceneRef.current = scene;
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(1, 2, 1);
    scene.add(dir);

    const grid = new THREE.GridHelper(1000, 20, 0x444448, 0x333338);
    scene.add(grid);

    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100000);
    camera.position.set(150, 100, 150);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controlsRef.current = controls;

    const clock = new THREE.Clock();
    let raf = 0;
    const animate = () => {
      // getDelta is called unconditionally so that unpausing doesn't jump the clip
      // forward by however long it sat paused.
      const delta = clock.getDelta();
      const { paused: isPaused, timeScale: speed } = playback.current;
      if (mixerRef.current && !isPaused) {
        mixerRef.current.update(delta * speed);
      }
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
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!scene || !camera || !controls || !gltfText) return;

    if (modelRef.current) {
      mixerRef.current?.stopAllAction();
      mixerRef.current?.uncacheRoot(modelRef.current);
      mixerRef.current = null;
      actionRef.current = null;
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

      // The server bakes the sequence in as morph-target animation, so playback is just
      // a mixer over whatever clip came down. No animation is a normal outcome (static
      // scenery, models with no vertex skins), not an error.
      const clip = gltf.animations[0];
      if (clip) {
        const mixer = new THREE.AnimationMixer(gltf.scene);
        const action = mixer.clipAction(clip);
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.play();
        mixerRef.current = mixer;
        actionRef.current = action;
        const times = Array.from(clip.tracks[0]?.times ?? []);
        onClipLoadedRef.current?.({
          duration: clip.duration,
          frameCount: times.length,
          frameTimes: times,
        });
      } else {
        onClipLoadedRef.current?.(null);
      }

      // Auto-frame: point the orbit target at the model's center and back the
      // camera off proportional to its size, so tiny props and huge NPCs both
      // land nicely in view without a hand-tuned camera per model.
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 0.001);
      const distance = maxDim * 2.2;

      camera.near = Math.max(maxDim / 100, 0.01);
      camera.far = maxDim * 100;
      camera.position.set(center.x + distance, center.y + distance * 0.6, center.z + distance);
      camera.updateProjectionMatrix();

      controls.target.copy(center);
      controls.update();
    });
  }, [gltfText]);

  // Scrubbing: setting the action's time and stepping the mixer by zero applies that pose
  // without advancing playback, so the held frame survives until the next seek.
  useEffect(() => {
    const action = actionRef.current;
    const mixer = mixerRef.current;
    if (!action || !mixer || seekTime == null) return;
    action.time = seekTime;
    mixer.update(0);
  }, [seekTime]);

  return <div ref={containerRef} style={{ width, height, borderRadius: 8, overflow: "hidden" }} />;
}

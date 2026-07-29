import * as THREE from "./vendor/three/three.module.min.js";
import { GLTFLoader } from "./vendor/three/addons/loaders/GLTFLoader.js";

const viewer = document.querySelector("[data-model-viewer]");
const stage = document.querySelector("[data-model-stage]");
const plate = document.querySelector("[data-model-plate]");
const canvas = document.querySelector("[data-model-canvas]");

if (viewer && stage && plate && canvas) {
  const photos = [...viewer.querySelectorAll("[data-sequence-photo]")];
  const ui = {
    loader: viewer.querySelector("[data-model-loader]"),
    loadBar: viewer.querySelector("[data-model-load-bar]"),
    loadValue: viewer.querySelector("[data-model-load-value]"),
    loadStatus: viewer.querySelector("[data-model-status]"),
    placeholder: viewer.querySelector("[data-model-placeholder]"),
    error: viewer.querySelector("[data-model-error]"),
    errorCopy: viewer.querySelector("[data-model-error-copy]"),
    sequenceBar: viewer.querySelector("[data-sequence-progress]"),
    sequenceValue: viewer.querySelector("[data-sequence-value]"),
    sequenceLabel: viewer.querySelector("[data-sequence-label]"),
    sequenceStatus: viewer.querySelector("[data-sequence-status]"),
    previous: viewer.querySelector("[data-sequence-prev]"),
    next: viewer.querySelector("[data-sequence-next]"),
    reset: viewer.querySelector("[data-sequence-reset]"),
    controls: [...viewer.querySelectorAll(".sequence-controls button")],
  };

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const initialRotation = {
    x: Math.PI / 2,
    y: 0,
    z: 0,
  };
  const parts = [];

  const MAX_SEQUENCE = 1;
  const MODEL_SCROLL_SHARE = 0.6;
  const PHOTO_FADE = 0.08;
  const PHOTO_START = MODEL_SCROLL_SHARE;
  const PHOTO_FULL = PHOTO_START + PHOTO_FADE;
  const PHOTO_STEP =
    photos.length > 1
      ? (MAX_SEQUENCE - PHOTO_FULL) / (photos.length - 1)
      : 0;
  const TOTAL_WHEEL_PIXELS = 2400;
  const MODEL_VIEW_HEIGHT_FACTOR = 1.72;
  const EPSILON = 0.001;

  let renderer;
  let scene;
  let camera;
  let modelPivot;
  let modelContent;
  let modelMaterial;
  let edgeMaterial;
  let modelRadius = 100;
  let modelReady = false;
  let frameId = 0;
  let sequenceTarget = 0;
  let sequenceCurrent = 0;
  let announcedState = "";

  const clamp = (value, minimum = 0, maximum = 1) =>
    Math.min(maximum, Math.max(minimum, value));
  const smoothstep = (value) => value * value * (3 - 2 * value);

  const sequenceStops = [0, PHOTO_START];
  if (photos.length) {
    for (let index = 0; index < photos.length; index += 1) {
      sequenceStops.push(PHOTO_FULL + index * PHOTO_STEP);
    }
  }
  if (MAX_SEQUENCE - sequenceStops[sequenceStops.length - 1] > EPSILON) {
    sequenceStops.push(MAX_SEQUENCE);
  }

  function setLoadState(value, label) {
    const percent = Math.round(clamp(value) * 100);
    if (ui.loadBar) ui.loadBar.style.transform = `scaleX(${percent / 100})`;
    if (ui.loadValue) {
      ui.loadValue.textContent = `${String(percent).padStart(2, "0")}%`;
    }
    if (ui.loadStatus && label && ui.loadStatus.textContent !== label) {
      ui.loadStatus.textContent = label;
    }
  }

  function photoPositionFor(value) {
    if (photos.length <= 1 || PHOTO_STEP <= 0) return 0;
    return clamp((value - PHOTO_FULL) / PHOTO_STEP, 0, photos.length - 1);
  }

  function updateSequenceMeter(value) {
    const totalProgress = MAX_SEQUENCE ? clamp(value / MAX_SEQUENCE) : 0;
    const totalPercent = Math.round(totalProgress * 100);

    if (ui.sequenceBar) {
      ui.sequenceBar.style.transform = `scaleX(${totalProgress})`;
    }
    if (ui.sequenceValue) {
      ui.sequenceValue.textContent = `${String(totalPercent).padStart(2, "0")}%`;
    }
    if (!ui.sequenceLabel) return;

    if (value < PHOTO_START) {
      const explodePercent = Math.round(clamp(value / PHOTO_START) * 100);
      ui.sequenceLabel.textContent = `ASSEMBLY / ${String(explodePercent).padStart(2, "0")}%`;
    } else if (value < PHOTO_FULL) {
      ui.sequenceLabel.textContent = "MODEL / PHOTO 01";
    } else {
      const photoIndex = Math.round(photoPositionFor(value)) + 1;
      ui.sequenceLabel.textContent = `PHOTO ${String(photoIndex).padStart(2, "0")} / ${String(photos.length).padStart(2, "0")}`;
    }
  }

  function announceSequenceState(value) {
    if (!ui.sequenceStatus) return;

    let key;
    let message;
    if (value <= EPSILON) {
      key = "assembly-assembled";
      message = "Assembly fully assembled.";
    } else if (value < PHOTO_START - EPSILON) {
      key = "assembly-moving";
      message = "Assembly separation in progress.";
    } else if (value < PHOTO_FULL - EPSILON) {
      key = "assembly-exploded";
      message = "Assembly fully exploded. Continuing reveals the project photos.";
    } else {
      const photoIndex = Math.round(photoPositionFor(value));
      key = `photo-${photoIndex}`;
      message = `Photo placeholder ${photoIndex + 1} of ${photos.length}.`;
    }

    if (key !== announcedState) {
      announcedState = key;
      ui.sequenceStatus.textContent = message;
    }
  }

  function updateControlState() {
    if (!modelReady) return;
    if (ui.previous) ui.previous.disabled = sequenceTarget <= EPSILON;
    if (ui.next) ui.next.disabled = sequenceTarget >= MAX_SEQUENCE - EPSILON;
    if (ui.reset) ui.reset.disabled = sequenceTarget <= EPSILON;
  }

  function updateTheme() {
    if (!modelMaterial || !edgeMaterial) return;
    const styles = getComputedStyle(document.documentElement);
    const blue = styles.getPropertyValue("--blue").trim() || "#4169e1";
    const line = styles.getPropertyValue("--text-soft").trim() || "#d9e4ff";
    modelMaterial.color.set(blue);
    edgeMaterial.color.set(line);
    scheduleRender();
  }

  function resizeRenderer() {
    if (!renderer || !camera) return;
    const width = Math.max(1, plate.clientWidth);
    const height = Math.max(1, plate.clientHeight);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);

    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);

    const aspect = width / height;
    const viewHeight =
      (modelRadius * MODEL_VIEW_HEIGHT_FACTOR) / Math.min(1, aspect);
    camera.left = (-viewHeight * aspect) / 2;
    camera.right = (viewHeight * aspect) / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.near = Math.max(0.01, modelRadius * 0.01);
    camera.far = Math.max(2000, modelRadius * 20);
    camera.position
      .set(-1, -1, 1)
      .normalize()
      .multiplyScalar(modelRadius * 5);
    camera.up.set(0, 0, 1);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    scheduleRender();
  }

  function updatePartPositions(value) {
    for (const part of parts) {
      const localProgress = clamp((value - part.userData.delay) / (1 - part.userData.delay));
      const eased = smoothstep(localProgress);
      part.position.lerpVectors(
        part.userData.assembledPosition,
        part.userData.explodedPosition,
        eased,
      );
    }
  }

  function updateSequenceVisuals(value) {
    const explodeProgress = clamp(value / PHOTO_START, 0, 1);
    const handoff = smoothstep(clamp((value - PHOTO_START) / PHOTO_FADE));
    const photoPosition = photoPositionFor(value);
    const lowerPhoto = Math.floor(photoPosition);
    const photoMix = smoothstep(photoPosition - lowerPhoto);

    updatePartPositions(explodeProgress);
    canvas.style.opacity = String(1 - handoff);

    photos.forEach((photo, index) => {
      let opacity = 0;
      if (index === lowerPhoto) opacity = 1 - photoMix;
      if (index === lowerPhoto + 1) opacity = photoMix;
      photo.style.opacity = String(opacity * handoff);
    });

    viewer.classList.toggle("is-photo-phase", handoff > 0.5);
    updateSequenceMeter(value);
    announceSequenceState(value);
  }

  function renderFrame() {
    frameId = 0;
    if (!renderer || !scene || !camera || !modelPivot) return;

    const difference = sequenceTarget - sequenceCurrent;
    if (motionQuery.matches || Math.abs(difference) <= EPSILON) {
      sequenceCurrent = sequenceTarget;
    } else {
      sequenceCurrent += difference * 0.16;
    }

    updateSequenceVisuals(sequenceCurrent);
    renderer.render(scene, camera);

    if (!motionQuery.matches && Math.abs(sequenceTarget - sequenceCurrent) > EPSILON) {
      scheduleRender();
    }
  }

  function scheduleRender() {
    if (!frameId && renderer) frameId = requestAnimationFrame(renderFrame);
  }

  function setSequenceTarget(value) {
    sequenceTarget = clamp(value, 0, MAX_SEQUENCE);
    updateControlState();
    scheduleRender();
  }

  function deterministicDirection(index) {
    const angle = index * 2.3999632297;
    const rise = ((index % 5) - 2) * 0.22;
    return new THREE.Vector3(Math.cos(angle), Math.sin(angle), rise).normalize();
  }

  async function buildAssembly(assemblyScene) {
    modelMaterial = new THREE.MeshStandardMaterial({
      color: 0x4169e1,
      metalness: 0.08,
      roughness: 0.78,
      side: THREE.DoubleSide,
    });
    edgeMaterial = new THREE.LineBasicMaterial({
      color: 0xd9e4ff,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });

    modelContent = assemblyScene;
    modelPivot.add(modelContent);

    modelContent.traverse((object) => {
      if (!object.isMesh || !object.geometry) return;
      object.material = modelMaterial;
      object.userData.sourceIndex = parts.length;
      object.geometry.computeBoundingBox();
      object.geometry.computeBoundingSphere();
      parts.push(object);
    });

    if (!parts.length) {
      throw new Error("The optimized assembly did not contain renderable parts.");
    }

    let outlinedTriangles = 0;
    for (const [index, part] of parts.entries()) {
      const geometry = part.geometry;
      const triangleCount = geometry.index
        ? geometry.index.count / 3
        : geometry.attributes.position.count / 3;
      if (triangleCount <= 12000 && outlinedTriangles + triangleCount <= 100000) {
        const edges = new THREE.EdgesGeometry(geometry, 28);
        const outline = new THREE.LineSegments(edges, edgeMaterial);
        outline.renderOrder = 2;
        part.add(outline);
        outlinedTriangles += triangleCount;
      }

      if (index > 0 && index % 8 === 0) {
        const buildProgress = index / parts.length;
        setLoadState(0.8 + buildProgress * 0.18, `BUILDING ${parts.length} PARTS`);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    }

    modelPivot.rotation.set(0, 0, 0);
    modelPivot.updateMatrixWorld(true);
    const assemblyBox = new THREE.Box3().setFromObject(modelContent);
    const assemblyCenter = assemblyBox.getCenter(new THREE.Vector3());
    const assemblySize = assemblyBox.getSize(new THREE.Vector3());
    const partCenters = parts.map((part) =>
      new THREE.Box3().setFromObject(part).getCenter(new THREE.Vector3()),
    );
    modelRadius = Math.max(1, assemblySize.length() / 2);
    modelContent.position.copy(assemblyCenter).multiplyScalar(-1);

    parts.forEach((part, index) => {
      const offset = partCenters[index].sub(assemblyCenter);
      const direction =
        offset.lengthSq() < modelRadius * modelRadius * 0.0025
          ? deterministicDirection(index)
          : offset.normalize();

      direction.z += Math.sign(direction.z || (index % 2 ? 1 : -1)) * 0.12;
      direction.normalize();

      const variation = 0.84 + ((index * 17) % 11) / 25;
      const distance = modelRadius * 0.34 * variation;
      part.userData.assembledPosition = part.position.clone();
      part.userData.explodedPosition = part.position
        .clone()
        .addScaledVector(direction, distance);
      part.userData.delay = (index % 9) * 0.012;
    });

    modelPivot.rotation.set(
      initialRotation.x,
      initialRotation.y,
      initialRotation.z,
    );
    modelPivot.updateMatrixWorld(true);

    updateTheme();
    resizeRenderer();
  }

  function initScene() {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;

    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 2000);
    modelPivot = new THREE.Group();
    scene.add(modelPivot);

    const hemisphere = new THREE.HemisphereLight(0xe9f2ff, 0x07111f, 2.35);
    const key = new THREE.DirectionalLight(0xffffff, 3.1);
    const fill = new THREE.DirectionalLight(0x6ea8ff, 1.4);
    key.position.set(4, -5, 8);
    fill.position.set(-5, 2, 3);
    scene.add(hemisphere, key, fill);

    resizeRenderer();
  }

  function loadOptimizedAssembly() {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.load(
        "assets/models/spider-robot.glb",
        resolve,
        (event) => {
          const progress = event.total ? event.loaded / event.total : 0.35;
          setLoadState(0.1 + progress * 0.64, "DOWNLOADING 109-PART ASSEMBLY");
        },
        reject,
      );
    });
  }

  async function loadAssembly() {
    try {
      initScene();
      setLoadState(0.08, "LOADING OPTIMIZED ASSEMBLY");
      const assembly = await loadOptimizedAssembly();
      setLoadState(0.78, "BUILDING 109 PARTS");
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await buildAssembly(assembly.scene);

      modelReady = true;
      ui.controls.forEach((control) => {
        control.disabled = false;
      });
      viewer.classList.add("is-model-ready");
      setLoadState(1, "ASSEMBLY READY");
      setTimeout(() => {
        if (ui.loader) ui.loader.hidden = true;
      }, 240);
      updateControlState();
      updateSequenceVisuals(0);
      scheduleRender();
    } catch (error) {
      console.error("Spider robot viewer:", error);
      stage.classList.add("is-model-error");
      viewer.classList.add("is-model-error");
      if (ui.loader) ui.loader.hidden = true;
      if (ui.error) ui.error.hidden = false;
      if (ui.errorCopy) {
        ui.errorCopy.textContent =
          window.location.protocol === "file:"
            ? "Open this page through GitHub Pages or a local web server."
            : "The assembly could not be loaded in this browser.";
      }
    }
  }

  function normalizedWheelDelta(event) {
    let delta = event.deltaY;
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) delta *= 16;
    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) delta *= plate.clientHeight;
    return delta;
  }

  function handleWheel(event) {
    if (
      !modelReady ||
      motionQuery.matches ||
      viewer.offsetParent === null ||
      event.ctrlKey ||
      event.metaKey ||
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
    ) {
      return;
    }

    const delta = normalizedWheelDelta(event);
    if (Math.abs(delta) < EPSILON) return;

    const movingBackward = delta < 0;
    const movingForward = delta > 0;
    const atStart = sequenceTarget <= EPSILON;
    const atEnd = sequenceTarget >= MAX_SEQUENCE - EPSILON;
    if ((movingBackward && atStart) || (movingForward && atEnd)) return;

    event.preventDefault();
    setSequenceTarget(sequenceTarget + delta / TOTAL_WHEEL_PIXELS);
  }

  function adjacentStop(direction) {
    if (direction > 0) {
      return sequenceStops.find((stop) => stop > sequenceTarget + EPSILON);
    }
    return [...sequenceStops]
      .reverse()
      .find((stop) => stop < sequenceTarget - EPSILON);
  }

  function stepSequence(direction) {
    const stop = adjacentStop(direction);
    if (stop === undefined) return false;
    setSequenceTarget(stop);
    return true;
  }

  function handleSequenceKey(event) {
    if (!modelReady) return;

    const forwardKeys = ["ArrowDown", "ArrowRight", "PageDown"];
    const backwardKeys = ["ArrowUp", "ArrowLeft", "PageUp"];
    let handled = false;

    if (forwardKeys.includes(event.key)) handled = stepSequence(1);
    if (backwardKeys.includes(event.key)) handled = stepSequence(-1);
    if (event.key === "Home" && sequenceTarget > EPSILON) {
      setSequenceTarget(0);
      handled = true;
    }
    if (event.key === "End" && sequenceTarget < MAX_SEQUENCE - EPSILON) {
      setSequenceTarget(MAX_SEQUENCE);
      handled = true;
    }

    if (handled) event.preventDefault();
  }

  viewer.addEventListener("wheel", handleWheel, { passive: false });
  plate.addEventListener("keydown", handleSequenceKey);
  ui.previous?.addEventListener("click", () => stepSequence(-1));
  ui.next?.addEventListener("click", () => stepSequence(1));
  ui.reset?.addEventListener("click", () => setSequenceTarget(0));

  motionQuery.addEventListener("change", () => {
    sequenceCurrent = sequenceTarget;
    scheduleRender();
  });

  const resizeObserver = new ResizeObserver(resizeRenderer);
  resizeObserver.observe(plate);

  const themeObserver = new MutationObserver(updateTheme);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  updateSequenceMeter(0);
  loadAssembly();
}

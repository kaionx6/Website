import * as THREE from "./vendor/three/three.module.min.js";
import { GLTFLoader } from "./vendor/three/addons/loaders/GLTFLoader.js";

const stage = document.querySelector("[data-model-stage]");
const viewer = document.querySelector("[data-model-viewer]");
const plate = document.querySelector("[data-model-plate]");
const canvas = document.querySelector("[data-model-canvas]");

if (stage && viewer && plate && canvas) {
  const ui = {
    loader: viewer.querySelector("[data-model-loader]"),
    loadBar: viewer.querySelector("[data-model-load-bar]"),
    loadValue: viewer.querySelector("[data-model-load-value]"),
    status: viewer.querySelector("[data-model-status]"),
    placeholder: viewer.querySelector("[data-model-placeholder]"),
    error: viewer.querySelector("[data-model-error]"),
    errorCopy: viewer.querySelector("[data-model-error-copy]"),
    progressBar: viewer.querySelector("[data-model-progress-bar]"),
    progressValue: viewer.querySelector("[data-model-progress-value]"),
    reset: viewer.querySelector("[data-model-reset]"),
    explode: viewer.querySelector("[data-model-explode]"),
    rotate: [...viewer.querySelectorAll("[data-model-rotate]")],
    controls: [...viewer.querySelectorAll(".model-controls button")],
  };

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointerQuery = window.matchMedia("(pointer: fine)");
  const initialRotation = { x: 0, z: -0.38 };
  const parts = [];

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
  let scrollFrameId = 0;
  let targetProgress = 0;
  let currentProgress = 0;
  let targetRotationX = initialRotation.x;
  let targetRotationZ = initialRotation.z;
  let currentRotationX = initialRotation.x;
  let currentRotationZ = initialRotation.z;
  let manualOverride = false;
  let isDragging = false;
  let dragX = 0;
  let dragY = 0;

  const clamp = (value, minimum = 0, maximum = 1) =>
    Math.min(maximum, Math.max(minimum, value));
  const smoothstep = (value) => value * value * (3 - 2 * value);

  function setLoadState(value, label, indeterminate = false) {
    const percent = Math.round(clamp(value) * 100);
    if (ui.loadBar) ui.loadBar.style.transform = `scaleX(${percent / 100})`;
    if (ui.loadValue) {
      ui.loadValue.textContent = indeterminate
        ? "--"
        : `${String(percent).padStart(2, "0")}%`;
    }
    if (ui.status && label && ui.status.textContent !== label) {
      ui.status.textContent = label;
    }
  }

  function setProgressUI(value) {
    const percent = Math.round(clamp(value) * 100);
    if (ui.progressBar) ui.progressBar.style.transform = `scaleX(${percent / 100})`;
    if (ui.progressValue) ui.progressValue.textContent = `${String(percent).padStart(2, "0")}%`;
  }

  function setExplodeButton(value) {
    if (!ui.explode) return;
    const exploded = value >= 0.5;
    ui.explode.setAttribute("aria-pressed", String(exploded));
    ui.explode.textContent = exploded ? "ASSEMBLE" : "EXPLODE";
  }

  function readScrollProgress() {
    if (motionQuery.matches) return manualOverride ? targetProgress : 0;

    const stageRect = stage.getBoundingClientRect();
    const stickyTop = Number.parseFloat(getComputedStyle(viewer).top) || 0;
    const travel = Math.max(1, stage.offsetHeight - viewer.offsetHeight);
    return clamp((stickyTop - stageRect.top) / travel);
  }

  function updateScrollProgress() {
    scrollFrameId = 0;
    if (manualOverride && !motionQuery.matches) manualOverride = false;
    if (!manualOverride) targetProgress = readScrollProgress();
    setProgressUI(targetProgress);
    setExplodeButton(targetProgress);
    scheduleRender();
  }

  function requestScrollUpdate() {
    if (!scrollFrameId) scrollFrameId = requestAnimationFrame(updateScrollProgress);
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
    const viewHeight = (modelRadius * 3.15) / Math.min(1, aspect);
    camera.left = (-viewHeight * aspect) / 2;
    camera.right = (viewHeight * aspect) / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.near = Math.max(0.01, modelRadius * 0.01);
    camera.far = Math.max(2000, modelRadius * 20);
    camera.position
      .set(modelRadius * 1.55, modelRadius * -1.9, modelRadius * 1.2)
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

  function renderFrame() {
    frameId = 0;
    if (!renderer || !scene || !camera || !modelPivot) return;

    const reduced = motionQuery.matches;
    const progressDelta = targetProgress - currentProgress;
    const rotationXDelta = targetRotationX - currentRotationX;
    const rotationZDelta = targetRotationZ - currentRotationZ;

    if (reduced) {
      currentProgress = targetProgress;
      currentRotationX = targetRotationX;
      currentRotationZ = targetRotationZ;
    } else {
      currentProgress += progressDelta * 0.16;
      currentRotationX += rotationXDelta * 0.18;
      currentRotationZ += rotationZDelta * 0.18;
    }

    updatePartPositions(currentProgress);
    modelPivot.rotation.x = currentRotationX;
    modelPivot.rotation.z = currentRotationZ;
    renderer.render(scene, camera);

    if (
      !reduced &&
      (Math.abs(progressDelta) > 0.001 ||
        Math.abs(rotationXDelta) > 0.001 ||
        Math.abs(rotationZDelta) > 0.001)
    ) {
      scheduleRender();
    }
  }

  function scheduleRender() {
    if (!frameId && renderer) frameId = requestAnimationFrame(renderFrame);
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
        setLoadState(
          0.8 + buildProgress * 0.18,
          `BUILDING ${parts.length} PARTS`,
        );
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

    modelPivot.rotation.set(currentRotationX, 0, currentRotationZ);
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
      updateScrollProgress();
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

  function rotateModel(direction) {
    if (!modelReady) return;
    targetRotationZ += direction * (Math.PI / 6);
    scheduleRender();
  }

  function resetModel() {
    targetRotationX = initialRotation.x;
    targetRotationZ = initialRotation.z;
    manualOverride = false;
    targetProgress = motionQuery.matches ? 0 : readScrollProgress();
    setProgressUI(targetProgress);
    setExplodeButton(targetProgress);
    scheduleRender();
  }

  function toggleExplosion() {
    manualOverride = true;
    targetProgress = targetProgress >= 0.5 ? 0 : 1;
    setProgressUI(targetProgress);
    setExplodeButton(targetProgress);
    scheduleRender();
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (!modelReady || !finePointerQuery.matches || event.button > 0) return;
    isDragging = true;
    dragX = event.clientX;
    dragY = event.clientY;
    canvas.classList.add("is-dragging");
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!isDragging) return;
    const deltaX = event.clientX - dragX;
    const deltaY = event.clientY - dragY;
    dragX = event.clientX;
    dragY = event.clientY;
    targetRotationZ += deltaX * 0.008;
    targetRotationX = clamp(targetRotationX + deltaY * 0.004, -0.42, 0.42);
    scheduleRender();
  });

  const finishDrag = (event) => {
    if (!isDragging) return;
    isDragging = false;
    canvas.classList.remove("is-dragging");
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };
  canvas.addEventListener("pointerup", finishDrag);
  canvas.addEventListener("pointercancel", finishDrag);

  ui.rotate.forEach((button) => {
    button.addEventListener("click", () => rotateModel(Number(button.dataset.modelRotate)));
  });
  ui.reset?.addEventListener("click", resetModel);
  ui.explode?.addEventListener("click", toggleExplosion);

  window.addEventListener("scroll", requestScrollUpdate, { passive: true });
  window.addEventListener("resize", requestScrollUpdate, { passive: true });
  motionQuery.addEventListener("change", resetModel);

  const resizeObserver = new ResizeObserver(() => {
    resizeRenderer();
    requestScrollUpdate();
  });
  resizeObserver.observe(plate);

  const themeObserver = new MutationObserver(updateTheme);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  updateScrollProgress();
  loadAssembly();
}

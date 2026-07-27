/*
 * Converts the portfolio's STEP assembly into an uncompressed glTF 2.0 binary.
 * Usage: node tools/convert-step-to-glb.cjs [input.step] [output.glb]
 */

const fs = require("fs");
const path = require("path");
const createOcct = require("../vendor/occt-import-js/occt-import-js.js");

const inputPath = path.resolve(
  process.argv[2] || "assets/models/spider-robot.step",
);
const outputPath = path.resolve(
  process.argv[3] || "assets/models/spider-robot.glb",
);
const occtDirectory = path.resolve("vendor/occt-import-js");

const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;
const FLOAT = 5126;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;

function typedBuffer(values, Type) {
  const array = Type.from(values);
  return Buffer.from(array.buffer, array.byteOffset, array.byteLength);
}

function bounds(values) {
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];

  for (let index = 0; index < values.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = values[index + axis];
      minimum[axis] = Math.min(minimum[axis], value);
      maximum[axis] = Math.max(maximum[axis], value);
    }
  }

  return { minimum, maximum };
}

async function convert() {
  const occt = await createOcct({
    locateFile: (fileName) => path.join(occtDirectory, fileName),
  });
  const stepBytes = new Uint8Array(fs.readFileSync(inputPath));
  const result = occt.ReadFile("step", stepBytes, {
    linearUnit: "millimeter",
    linearDeflectionType: "bounding_box_ratio",
    linearDeflection: 0.002,
    angularDeflection: 0.35,
  });

  if (!result?.success || !Array.isArray(result.meshes) || !result.meshes.length) {
    throw new Error("OCCT did not return a renderable STEP assembly.");
  }

  const binaryChunks = [];
  const bufferViews = [];
  const accessors = [];
  const meshes = [];
  const nodes = [];
  let binaryLength = 0;

  function addBufferView(buffer, target) {
    const viewIndex = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset: binaryLength,
      byteLength: buffer.length,
      target,
    });
    binaryChunks.push(buffer);
    binaryLength += buffer.length;

    const paddingLength = (4 - (binaryLength % 4)) % 4;
    if (paddingLength) {
      binaryChunks.push(Buffer.alloc(paddingLength));
      binaryLength += paddingLength;
    }

    return viewIndex;
  }

  function addAccessor(bufferView, componentType, count, type, range) {
    const accessor = { bufferView, componentType, count, type };
    if (range) {
      accessor.min = range.minimum;
      accessor.max = range.maximum;
    }
    accessors.push(accessor);
    return accessors.length - 1;
  }

  result.meshes.forEach((source, index) => {
    const positions = source?.attributes?.position?.array;
    const normals = source?.attributes?.normal?.array;
    const indices = source?.index?.array;
    if (!positions?.length || !indices?.length) return;

    const positionView = addBufferView(
      typedBuffer(positions, Float32Array),
      ARRAY_BUFFER,
    );
    const positionAccessor = addAccessor(
      positionView,
      FLOAT,
      positions.length / 3,
      "VEC3",
      bounds(positions),
    );

    let normalAccessor;
    if (normals?.length === positions.length) {
      const normalView = addBufferView(
        typedBuffer(normals, Float32Array),
        ARRAY_BUFFER,
      );
      normalAccessor = addAccessor(
        normalView,
        FLOAT,
        normals.length / 3,
        "VEC3",
      );
    }

    const maximumIndex = indices.reduce(
      (maximum, value) => Math.max(maximum, value),
      0,
    );
    const IndexType = maximumIndex < 65536 ? Uint16Array : Uint32Array;
    const indexType = maximumIndex < 65536 ? UNSIGNED_SHORT : UNSIGNED_INT;
    const indexView = addBufferView(
      typedBuffer(indices, IndexType),
      ELEMENT_ARRAY_BUFFER,
    );
    const indexAccessor = addAccessor(
      indexView,
      indexType,
      indices.length,
      "SCALAR",
      { minimum: [0], maximum: [maximumIndex] },
    );

    const attributes = { POSITION: positionAccessor };
    if (normalAccessor !== undefined) attributes.NORMAL = normalAccessor;

    meshes.push({
      name: source.name || `ASSEMBLY_PART_${index + 1}`,
      primitives: [
        {
          attributes,
          indices: indexAccessor,
          material: 0,
          mode: 4,
        },
      ],
    });
    nodes.push({
      name: source.name || `ASSEMBLY_PART_${index + 1}`,
      mesh: meshes.length - 1,
    });
  });

  const gltf = {
    asset: {
      version: "2.0",
      generator: "Kelvin Gao portfolio / occt-import-js 0.0.23",
    },
    scene: 0,
    scenes: [{ name: "Spider robot assembly", nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    materials: [
      {
        name: "Site blue",
        pbrMetallicRoughness: {
          baseColorFactor: [0.078, 0.373, 0.78, 1],
          metallicFactor: 0.08,
          roughnessFactor: 0.78,
        },
        doubleSided: true,
      },
    ],
    accessors,
    bufferViews,
    buffers: [{ byteLength: binaryLength }],
    extras: {
      source: path.basename(inputPath),
      renderedParts: nodes.length,
      uniqueSolids: 29,
    },
  };

  const jsonSource = Buffer.from(JSON.stringify(gltf), "utf8");
  const jsonPadding = (4 - (jsonSource.length % 4)) % 4;
  const jsonChunk = Buffer.concat([
    jsonSource,
    Buffer.alloc(jsonPadding, 0x20),
  ]);
  const binaryChunk = Buffer.concat(binaryChunks, binaryLength);
  const totalLength = 12 + 8 + jsonChunk.length + 8 + binaryChunk.length;

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);

  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(binaryChunk.length, 0);
  binaryHeader.writeUInt32LE(0x004e4942, 4);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    Buffer.concat([header, jsonHeader, jsonChunk, binaryHeader, binaryChunk]),
  );

  const triangleCount = result.meshes.reduce(
    (total, mesh) => total + (mesh.index?.array?.length || 0) / 3,
    0,
  );
  console.log(
    JSON.stringify({
      output: outputPath,
      bytes: totalLength,
      parts: nodes.length,
      triangles: triangleCount,
    }),
  );
}

convert().catch((error) => {
  console.error(error);
  process.exit(1);
});

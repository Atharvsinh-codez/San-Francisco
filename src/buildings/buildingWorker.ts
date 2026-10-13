// Web Worker for off-main-thread building cell meshing (earcut + roof/facade generation).
// Transfers typed-array ArrayBuffers back to the main thread with zero copy so the browser
// never drops frames while streaming the 36 San Francisco building cells.

import { meshBuildingCellBuffer } from './BuildingMesher';

export interface WorkerMeshRequest {
  id: number;
  file: string;
  buffer: ArrayBuffer;
  centerX: number;
  centerZ: number;
  ix: number;
  iz: number;
  quant: number;
}

export interface WorkerMeshResponse {
  id: number;
  file: string;
  position: Float32Array | null;
  normal: Float32Array | null;
  color: Float32Array | null;
  aFacade: Float32Array | null;
  aBldg: Float32Array | null;
  triangles: number;
}

const ctx: {
  onmessage: ((e: MessageEvent<WorkerMeshRequest>) => void) | null;
  postMessage: (message: any, transfer?: Transferable[]) => void;
} = self as any;

ctx.onmessage = (e: MessageEvent<WorkerMeshRequest>) => {
  const { id, file, buffer, centerX, centerZ, ix, iz, quant } = e.data;
  try {
    const meshed = meshBuildingCellBuffer(buffer, centerX, centerZ, ix, iz, quant);
    if (!meshed || meshed.triangles === 0) {
      const empty: WorkerMeshResponse = {
        id,
        file,
        position: null,
        normal: null,
        color: null,
        aFacade: null,
        aBldg: null,
        triangles: 0,
      };
      ctx.postMessage(empty);
      return;
    }

    const res: WorkerMeshResponse = {
      id,
      file,
      position: meshed.position,
      normal: meshed.normal,
      color: meshed.color,
      aFacade: meshed.aFacade,
      aBldg: meshed.aBldg,
      triangles: meshed.triangles,
    };

    ctx.postMessage(res, [
      meshed.position.buffer,
      meshed.normal.buffer,
      meshed.color.buffer,
      meshed.aFacade.buffer,
      meshed.aBldg.buffer,
    ]);
  } catch (err) {
    console.warn('Building worker mesh error:', file, err);
    ctx.postMessage({
      id,
      file,
      position: null,
      normal: null,
      color: null,
      aFacade: null,
      aBldg: null,
      triangles: 0,
    });
  }
};

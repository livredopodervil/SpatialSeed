import {
  MODULE_MANIFEST_VERSION
} from "../../plugin-api/src/index.js?build=20260802-0047b";
import { boxRegionReducer } from "./reducer.js?build=20260801-0045a1";

export const REGION_BOX_REDUCER_CONTRIBUTION_ID =
  "spatialseed.document.reducer.box-region";

export const regionBoxModule = Object.freeze({
  manifest: Object.freeze({
    manifestVersion: MODULE_MANIFEST_VERSION,
    id: "spatialseed.document.region-box",
    version: "1.0.0",
    requires: Object.freeze({
      modules: Object.freeze([]),
      capabilities: Object.freeze([])
    }),
    provides: Object.freeze({
      capabilities: Object.freeze([])
    }),
    contributes: Object.freeze({
      reducers: Object.freeze([
        Object.freeze({
          id: REGION_BOX_REDUCER_CONTRIBUTION_ID,
          apiVersion: "spatial-seed-region-reducer-v1"
        })
      ])
    }),
    permissions: Object.freeze([])
  }),

  createModule() {
    return Object.freeze({
      activate() {
        return Object.freeze({
          contributions: Object.freeze({
            reducers: Object.freeze({
              [REGION_BOX_REDUCER_CONTRIBUTION_ID]: boxRegionReducer
            })
          }),
          status: Object.freeze({ reducers: 1 })
        });
      },
      dispose() {}
    });
  }
});

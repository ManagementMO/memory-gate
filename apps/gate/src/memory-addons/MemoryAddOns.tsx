/** Optional features attach here, beside the existing journey. These fragments add no DOM or scene wrapper. */
import { GateObjectsLayer, GateObjectsUI } from '../memory-objects/GateObjects';
import { ObjectInfoHUD, ObjectInfoLayer } from '../object-info/ObjectInfo';

/** Screen UI for source imports, optional props and public object information. */
export function MemoryAddOnsOverlay() {
  return <><GateObjectsUI /><ObjectInfoHUD /></>;
}

/** Native 3D counterparts: also visible in immersive VR, where the page's DOM is unavailable. */
export function MemoryAddOnsScene() {
  return <><GateObjectsLayer /><ObjectInfoLayer /></>;
}

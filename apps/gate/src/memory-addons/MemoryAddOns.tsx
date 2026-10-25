/** Optional features attach here, beside the existing journey. These fragments add no DOM or scene wrapper. */
import { Component, type ReactNode } from 'react';
import { GateObjectsLayer, GateObjectsUI } from '../memory-objects/GateObjects';
import { ObjectInfoHUD, ObjectInfoLayer } from '../object-info/ObjectInfo';

/** An optional feature that fails (its backend function missing or erroring) steps aside instead of taking the visit
 *  down with it: an error here would reach the page's boundary, which replaces the whole app, the 3D canvas and the
 *  headset's view included. */
class Optional extends Component<{ name: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { console.warn(`[add-ons] ${this.props.name} stepped aside:`, e); }
  render() { return this.state.failed ? null : this.props.children; }
}

/** Screen UI for source imports, optional props and public object information. */
export function MemoryAddOnsOverlay() {
  return <><Optional name="objects"><GateObjectsUI /></Optional><Optional name="object info"><ObjectInfoHUD /></Optional></>;
}

/** Native 3D counterparts: also visible in immersive VR, where the page's DOM is unavailable. */
export function MemoryAddOnsScene() {
  return <><Optional name="objects"><GateObjectsLayer /></Optional><Optional name="object info"><ObjectInfoLayer /></Optional></>;
}

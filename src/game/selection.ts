import { EntityId } from "../engine/types";

export type Faction = "player" | "enemy";

/**
 * Returns the new selection after a unit is clicked and the click was not
 * handled (e.g. no attack/move queued). Both player and enemy units can be
 * selected; only one unit is selected at a time.
 */
export function getSelectionAfterUnitClick(
  _currentSelection: EntityId | null,
  clickedEntityId: EntityId,
  _clickedFaction: Faction
): EntityId {
  return clickedEntityId;
}

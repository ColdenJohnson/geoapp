const MERCATOR_MAX_LATITUDE = 85.05112878;
const POINT_COLLISION_EPSILON = 0.0000001;

export const DEFAULT_PIN_COLLISION_DISTANCE_PX = 32;
export const MIN_CLUSTER_LATITUDE_DELTA = 0.002;
export const MIN_CLUSTER_LONGITUDE_DELTA = 0.002;

function clampLatitude(latitude) {
  return Math.max(-MERCATOR_MAX_LATITUDE, Math.min(MERCATOR_MAX_LATITUDE, latitude));
}

function normalizeLongitudeOffset(offset) {
  if (!Number.isFinite(offset)) return null;

  let nextOffset = offset;
  while (nextOffset < 0) {
    nextOffset += 360;
  }
  while (nextOffset > 360) {
    nextOffset -= 360;
  }
  return nextOffset;
}

function projectLatitudeToMercatorY(latitude) {
  const clampedLatitude = clampLatitude(latitude);
  const radians = (clampedLatitude * Math.PI) / 180;
  return 0.5 - (Math.log(Math.tan(Math.PI / 4 + radians / 2)) / (2 * Math.PI));
}

function parseDateMs(value) {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function hasValidMapSize(mapSize) {
  return Number.isFinite(mapSize?.width)
    && mapSize.width > 0
    && Number.isFinite(mapSize?.height)
    && mapSize.height > 0;
}

function hasValidRegion(region) {
  return Number.isFinite(region?.latitude)
    && Number.isFinite(region?.longitude)
    && Number.isFinite(region?.latitudeDelta)
    && region.latitudeDelta > 0
    && Number.isFinite(region?.longitudeDelta)
    && region.longitudeDelta > 0;
}

function hasValidCoordinate(coordinate) {
  return Number.isFinite(coordinate?.latitude) && Number.isFinite(coordinate?.longitude);
}

export function getPinDisplayCoordinate(pin) {
  const displayLatitude = pin?.displayCoords?.latitude;
  const displayLongitude = pin?.displayCoords?.longitude;
  if (Number.isFinite(displayLatitude) && Number.isFinite(displayLongitude)) {
    return {
      latitude: displayLatitude,
      longitude: displayLongitude,
    };
  }

  const latitude = pin?.location?.latitude;
  const longitude = pin?.location?.longitude;
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return {
      latitude,
      longitude,
    };
  }

  return null;
}

export function getPinRecencyMs(pin) {
  const createdAtMs = parseDateMs(pin?.createdAt);
  if (createdAtMs !== null) {
    return createdAtMs;
  }

  const updatedAtMs = parseDateMs(pin?.updatedAt);
  if (updatedAtMs !== null) {
    return updatedAtMs;
  }

  const photoCreatedAtMs = parseDateMs(pin?.top_global_photo?.createdAt);
  if (photoCreatedAtMs !== null) {
    return photoCreatedAtMs;
  }

  const photoUpdatedAtMs = parseDateMs(pin?.top_global_photo?.updatedAt);
  if (photoUpdatedAtMs !== null) {
    return photoUpdatedAtMs;
  }

  return 0;
}

function getPinPopularityScore(pin) {
  const photoCount = Number(pin?.photo_count);
  if (!Number.isFinite(photoCount)) {
    return 0;
  }

  return Math.max(0, photoCount);
}

export function projectCoordinateToMapPoint(coordinate, region, mapSize) {
  if (!hasValidCoordinate(coordinate) || !hasValidRegion(region) || !hasValidMapSize(mapSize)) {
    return null;
  }

  const longitudeDelta = Math.min(Math.max(region.longitudeDelta, 0.000001), 360);
  const westLongitude = region.longitude - longitudeDelta / 2;
  const longitudeOffset = normalizeLongitudeOffset(coordinate.longitude - westLongitude);
  if (longitudeOffset === null) {
    return null;
  }

  const northLatitude = clampLatitude(region.latitude + region.latitudeDelta / 2);
  const southLatitude = clampLatitude(region.latitude - region.latitudeDelta / 2);
  const northMercatorY = projectLatitudeToMercatorY(northLatitude);
  const southMercatorY = projectLatitudeToMercatorY(southLatitude);
  const coordinateMercatorY = projectLatitudeToMercatorY(coordinate.latitude);
  const mercatorHeight = southMercatorY - northMercatorY;
  if (!Number.isFinite(mercatorHeight) || Math.abs(mercatorHeight) < Number.EPSILON) {
    return null;
  }

  return {
    x: (longitudeOffset / longitudeDelta) * mapSize.width,
    y: ((coordinateMercatorY - northMercatorY) / mercatorHeight) * mapSize.height,
  };
}

function comparePinsByPriority(left, right) {
  if (right.popularityScore !== left.popularityScore) {
    return right.popularityScore - left.popularityScore;
  }

  if (right.recencyMs !== left.recencyMs) {
    return right.recencyMs - left.recencyMs;
  }

  const leftId = String(left.pin?._id || '');
  const rightId = String(right.pin?._id || '');
  return rightId.localeCompare(leftId);
}

function pointDistance(firstPoint, secondPoint) {
  const deltaX = firstPoint.x - secondPoint.x;
  const deltaY = firstPoint.y - secondPoint.y;
  return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
}

function buildGroupId(entries) {
  const ids = entries
    .map((entry) => String(entry.pin?._id || ''))
    .filter(Boolean)
    .sort();

  return ids.join(':') || `cluster-${entries.length}`;
}

function finalizeClusterGroup(group) {
  const memberPins = group.members.map((member) => member.pin);
  const latitudeSpan = group.coordinateBounds.maxLatitude - group.coordinateBounds.minLatitude;
  const longitudeSpan = group.coordinateBounds.maxLongitude - group.coordinateBounds.minLongitude;

  return {
    id: buildGroupId(group.members),
    representativePin: group.representative.pin,
    representativeCoordinate: group.representative.coordinate,
    memberPins,
    memberCount: memberPins.length,
    isCluster: memberPins.length > 1,
    isPointCollision:
      memberPins.length > 1
      && latitudeSpan <= POINT_COLLISION_EPSILON
      && longitudeSpan <= POINT_COLLISION_EPSILON,
    coordinateBounds: {
      minLatitude: group.coordinateBounds.minLatitude,
      maxLatitude: group.coordinateBounds.maxLatitude,
      minLongitude: group.coordinateBounds.minLongitude,
      maxLongitude: group.coordinateBounds.maxLongitude,
    },
    recencyMs: group.representative.recencyMs,
  };
}

export function clusterMapPins(pins, options = {}) {
  const { region, mapSize, collisionDistancePx = DEFAULT_PIN_COLLISION_DISTANCE_PX } = options;

  if (!Array.isArray(pins) || pins.length === 0) {
    return [];
  }

  const entries = pins
    .map((pin) => {
      const coordinate = getPinDisplayCoordinate(pin);
      if (!hasValidCoordinate(coordinate)) {
        return null;
      }

      return {
        pin,
        coordinate,
        point: projectCoordinateToMapPoint(coordinate, region, mapSize),
        popularityScore: getPinPopularityScore(pin),
        recencyMs: getPinRecencyMs(pin),
      };
    })
    .filter(Boolean);

  if (!hasValidRegion(region) || !hasValidMapSize(mapSize)) {
    return entries
      .sort(comparePinsByPriority)
      .map((entry) => ({
        id: buildGroupId([entry]),
        representativePin: entry.pin,
        representativeCoordinate: entry.coordinate,
        memberPins: [entry.pin],
        memberCount: 1,
        isCluster: false,
        isPointCollision: false,
        coordinateBounds: {
          minLatitude: entry.coordinate.latitude,
          maxLatitude: entry.coordinate.latitude,
          minLongitude: entry.coordinate.longitude,
          maxLongitude: entry.coordinate.longitude,
        },
        recencyMs: entry.recencyMs,
      }));
  }

  const sortedEntries = entries
    .filter((entry) => entry.point !== null)
    .sort(comparePinsByPriority);

  const groups = [];

  for (const entry of sortedEntries) {
    let matchedGroup = null;

    for (const group of groups) {
      const collidesWithGroup = group.members.some((member) => (
        pointDistance(member.point, entry.point) <= collisionDistancePx
      ));

      if (collidesWithGroup) {
        matchedGroup = group;
        break;
      }
    }

    if (!matchedGroup) {
      groups.push({
        representative: entry,
        members: [entry],
        coordinateBounds: {
          minLatitude: entry.coordinate.latitude,
          maxLatitude: entry.coordinate.latitude,
          minLongitude: entry.coordinate.longitude,
          maxLongitude: entry.coordinate.longitude,
        },
      });
      continue;
    }

    matchedGroup.members.push(entry);
    matchedGroup.coordinateBounds.minLatitude = Math.min(
      matchedGroup.coordinateBounds.minLatitude,
      entry.coordinate.latitude
    );
    matchedGroup.coordinateBounds.maxLatitude = Math.max(
      matchedGroup.coordinateBounds.maxLatitude,
      entry.coordinate.latitude
    );
    matchedGroup.coordinateBounds.minLongitude = Math.min(
      matchedGroup.coordinateBounds.minLongitude,
      entry.coordinate.longitude
    );
    matchedGroup.coordinateBounds.maxLongitude = Math.max(
      matchedGroup.coordinateBounds.maxLongitude,
      entry.coordinate.longitude
    );
  }

  return groups.map(finalizeClusterGroup);
}

export function buildPinVisibilityIndex(groups) {
  const index = new Map();

  if (!Array.isArray(groups)) {
    return index;
  }

  for (const group of groups) {
    const representativePinId = String(group?.representativePin?._id || '');
    const representativeCoordinate = group?.representativeCoordinate || getPinDisplayCoordinate(group?.representativePin);
    const memberPins = Array.isArray(group?.memberPins) ? group.memberPins : [];

    for (const memberPin of memberPins) {
      const pinId = String(memberPin?._id || '');
      const coordinate = getPinDisplayCoordinate(memberPin);

      if (!pinId || !hasValidCoordinate(coordinate) || !hasValidCoordinate(representativeCoordinate)) {
        continue;
      }

      index.set(pinId, {
        pinId,
        pin: memberPin,
        coordinate,
        representativePinId,
        representativeCoordinate,
        isVisibleRepresentative: pinId === representativePinId,
        memberCount: Number.isFinite(group?.memberCount) ? group.memberCount : 1,
      });
    }
  }

  return index;
}

function hasVisibleTransitionDelta(translateFrom, translateTo) {
  return Math.abs(translateTo.x - translateFrom.x) >= 1 || Math.abs(translateTo.y - translateFrom.y) >= 1;
}

export function buildPinTransitionItems(previousGroups, nextGroups, options = {}) {
  const { region, mapSize } = options;

  if (!hasValidRegion(region) || !hasValidMapSize(mapSize)) {
    return [];
  }

  const previousIndex = buildPinVisibilityIndex(previousGroups);
  const nextIndex = buildPinVisibilityIndex(nextGroups);
  const pinIds = new Set([
    ...previousIndex.keys(),
    ...nextIndex.keys(),
  ]);
  const transitions = [];

  for (const pinId of pinIds) {
    const previousEntry = previousIndex.get(pinId) || null;
    const nextEntry = nextIndex.get(pinId) || null;

    if (
      previousEntry?.isVisibleRepresentative === true
      && nextEntry?.isVisibleRepresentative === false
      && nextEntry?.representativePinId
      && nextEntry.representativePinId !== pinId
    ) {
      const sourcePoint = projectCoordinateToMapPoint(previousEntry.coordinate, region, mapSize);
      const targetPoint = projectCoordinateToMapPoint(nextEntry.representativeCoordinate, region, mapSize);
      if (!sourcePoint || !targetPoint) {
        continue;
      }

      const translateFrom = { x: 0, y: 0 };
      const translateTo = {
        x: targetPoint.x - sourcePoint.x,
        y: targetPoint.y - sourcePoint.y,
      };

      if (!hasVisibleTransitionDelta(translateFrom, translateTo)) {
        continue;
      }

      transitions.push({
        id: `merge:${pinId}:${previousEntry.representativePinId || pinId}:${nextEntry.representativePinId}`,
        pinId,
        pin: previousEntry.pin,
        direction: 'out',
        anchorCoordinate: previousEntry.coordinate,
        translateFrom,
        translateTo,
      });
      continue;
    }

    if (
      previousEntry?.isVisibleRepresentative === false
      && nextEntry?.isVisibleRepresentative === true
      && previousEntry?.representativePinId
      && previousEntry.representativePinId !== pinId
    ) {
      const sourcePoint = projectCoordinateToMapPoint(previousEntry.representativeCoordinate, region, mapSize);
      const targetPoint = projectCoordinateToMapPoint(nextEntry.coordinate, region, mapSize);
      if (!sourcePoint || !targetPoint) {
        continue;
      }

      const translateFrom = {
        x: sourcePoint.x - targetPoint.x,
        y: sourcePoint.y - targetPoint.y,
      };
      const translateTo = { x: 0, y: 0 };

      if (!hasVisibleTransitionDelta(translateFrom, translateTo)) {
        continue;
      }

      transitions.push({
        id: `split:${pinId}:${previousEntry.representativePinId}:${nextEntry.representativePinId || pinId}`,
        pinId,
        pin: nextEntry.pin,
        direction: 'in',
        anchorCoordinate: nextEntry.coordinate,
        translateFrom,
        translateTo,
      });
    }
  }

  return transitions;
}

export function buildClusterRegion(group) {
  const minLatitude = group?.coordinateBounds?.minLatitude;
  const maxLatitude = group?.coordinateBounds?.maxLatitude;
  const minLongitude = group?.coordinateBounds?.minLongitude;
  const maxLongitude = group?.coordinateBounds?.maxLongitude;

  if (
    !Number.isFinite(minLatitude)
    || !Number.isFinite(maxLatitude)
    || !Number.isFinite(minLongitude)
    || !Number.isFinite(maxLongitude)
  ) {
    return null;
  }

  const latitudeSpan = Math.abs(maxLatitude - minLatitude);
  const longitudeSpan = Math.abs(maxLongitude - minLongitude);

  return {
    latitude: minLatitude + latitudeSpan / 2,
    longitude: minLongitude + longitudeSpan / 2,
    latitudeDelta: Math.max(latitudeSpan * 2.6, MIN_CLUSTER_LATITUDE_DELTA),
    longitudeDelta: Math.max(longitudeSpan * 2.6, MIN_CLUSTER_LONGITUDE_DELTA),
  };
}

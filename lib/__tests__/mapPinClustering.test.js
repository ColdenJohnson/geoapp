const {
  buildPinTransitionItems,
  buildClusterRegion,
  clusterMapPins,
  getPinDisplayCoordinate,
  getPinRecencyMs,
} = require('../mapPinClustering');

function createPin({
  id,
  latitude,
  longitude,
  createdAt,
  updatedAt,
  photoCount,
}) {
  return {
    _id: id,
    location: {
      latitude,
      longitude,
    },
    createdAt: createdAt || null,
    updatedAt: updatedAt || null,
    photo_count: photoCount ?? 0,
  };
}

describe('mapPinClustering', () => {
  const region = {
    latitude: 37.78,
    longitude: -122.42,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  };
  const mapSize = { width: 300, height: 600 };

  it('prefers display coordinates when they are present', () => {
    const pin = {
      location: { latitude: 1, longitude: 2 },
      displayCoords: { latitude: 3, longitude: 4 },
    };

    expect(getPinDisplayCoordinate(pin)).toEqual({ latitude: 3, longitude: 4 });
  });

  it('uses createdAt before updatedAt for recency ordering', () => {
    const pin = createPin({
      id: 'pin-1',
      latitude: 37.78,
      longitude: -122.42,
      createdAt: '2026-03-16T12:00:00.000Z',
      updatedAt: '2026-03-17T12:00:00.000Z',
    });

    expect(getPinRecencyMs(pin)).toBe(Date.parse('2026-03-16T12:00:00.000Z'));
  });

  it('clusters nearby pins and keeps the most popular pin as the representative', () => {
    const pins = [
      createPin({
        id: 'older',
        latitude: 37.78,
        longitude: -122.42,
        createdAt: '2026-03-15T00:00:00.000Z',
        photoCount: 12,
      }),
      createPin({
        id: 'newer',
        latitude: 37.78,
        longitude: -122.4189,
        createdAt: '2026-03-17T00:00:00.000Z',
        photoCount: 3,
      }),
      createPin({
        id: 'separate',
        latitude: 37.78,
        longitude: -122.414,
        createdAt: '2026-03-14T00:00:00.000Z',
        photoCount: 1,
      }),
    ];

    const groups = clusterMapPins(pins, {
      region,
      mapSize,
      collisionDistancePx: 44,
    });

    expect(groups).toHaveLength(2);
    expect(groups[0].representativePin._id).toBe('older');
    expect(groups[0].memberCount).toBe(2);
    expect(groups[0].isCluster).toBe(true);
    expect(groups[1].representativePin._id).toBe('separate');
    expect(groups[1].memberCount).toBe(1);
  });

  it('marks exact coordinate overlaps as point collisions', () => {
    const groups = clusterMapPins([
      createPin({
        id: 'pin-a',
        latitude: 37.78,
        longitude: -122.42,
        createdAt: '2026-03-16T00:00:00.000Z',
      }),
      createPin({
        id: 'pin-b',
        latitude: 37.78,
        longitude: -122.42,
        createdAt: '2026-03-17T00:00:00.000Z',
      }),
    ], {
      region,
      mapSize,
      collisionDistancePx: 44,
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].isCluster).toBe(true);
    expect(groups[0].isPointCollision).toBe(true);
    expect(groups[0].representativePin._id).toBe('pin-b');
  });

  it('builds a bounded zoom region for a cluster', () => {
    const [group] = clusterMapPins([
      createPin({
        id: 'pin-a',
        latitude: 37.78,
        longitude: -122.42,
        createdAt: '2026-03-16T00:00:00.000Z',
      }),
      createPin({
        id: 'pin-b',
        latitude: 37.781,
        longitude: -122.419,
        createdAt: '2026-03-17T00:00:00.000Z',
      }),
    ], {
      region,
      mapSize,
      collisionDistancePx: 120,
    });

    const nextRegion = buildClusterRegion(group);

    expect(nextRegion.latitude).toBeCloseTo(37.7805);
    expect(nextRegion.longitude).toBeCloseTo(-122.4195);
    expect(nextRegion.latitudeDelta).toBeCloseTo(0.0026);
    expect(nextRegion.longitudeDelta).toBeCloseTo(0.0026);
  });

  it('builds split transitions from the representative pin to newly visible pins', () => {
    const previousGroups = clusterMapPins([
      createPin({
        id: 'pin-a',
        latitude: 37.78,
        longitude: -122.42,
        createdAt: '2026-03-17T00:00:00.000Z',
      }),
      createPin({
        id: 'pin-b',
        latitude: 37.78,
        longitude: -122.4189,
        createdAt: '2026-03-16T00:00:00.000Z',
      }),
    ], {
      region,
      mapSize,
      collisionDistancePx: 44,
    });
    const nextGroups = clusterMapPins([
      createPin({
        id: 'pin-a',
        latitude: 37.78,
        longitude: -122.42,
        createdAt: '2026-03-17T00:00:00.000Z',
      }),
      createPin({
        id: 'pin-b',
        latitude: 37.78,
        longitude: -122.4189,
        createdAt: '2026-03-16T00:00:00.000Z',
      }),
    ], {
      region,
      mapSize,
      collisionDistancePx: 12,
    });

    const transitions = buildPinTransitionItems(previousGroups, nextGroups, {
      region,
      mapSize,
    });

    expect(transitions).toHaveLength(1);
    expect(transitions[0].id).toContain('split:pin-b');
    expect(transitions[0].direction).toBe('in');
    expect(transitions[0].anchorCoordinate).toEqual({
      latitude: 37.78,
      longitude: -122.4189,
    });
  });

  it('builds merge transitions from disappearing visible pins into the representative pin', () => {
    const previousGroups = clusterMapPins([
      createPin({
        id: 'pin-a',
        latitude: 37.78,
        longitude: -122.42,
        createdAt: '2026-03-17T00:00:00.000Z',
      }),
      createPin({
        id: 'pin-b',
        latitude: 37.78,
        longitude: -122.4189,
        createdAt: '2026-03-16T00:00:00.000Z',
      }),
    ], {
      region,
      mapSize,
      collisionDistancePx: 12,
    });
    const nextGroups = clusterMapPins([
      createPin({
        id: 'pin-a',
        latitude: 37.78,
        longitude: -122.42,
        createdAt: '2026-03-17T00:00:00.000Z',
      }),
      createPin({
        id: 'pin-b',
        latitude: 37.78,
        longitude: -122.4189,
        createdAt: '2026-03-16T00:00:00.000Z',
      }),
    ], {
      region,
      mapSize,
      collisionDistancePx: 44,
    });

    const transitions = buildPinTransitionItems(previousGroups, nextGroups, {
      region,
      mapSize,
    });

    expect(transitions).toHaveLength(1);
    expect(transitions[0].id).toContain('merge:pin-b');
    expect(transitions[0].direction).toBe('out');
    expect(transitions[0].anchorCoordinate).toEqual({
      latitude: 37.78,
      longitude: -122.4189,
    });
  });
});

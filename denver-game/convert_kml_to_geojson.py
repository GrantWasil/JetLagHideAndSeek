#!/usr/bin/env python3
"""Convert the Denver game's Google My Maps KML exports to GeoJSON for the tool.

Outputs (next to this script):
  - denver-border.hidingzone.json  -> import via Options -> Paste Hiding Zone
                                       (emitted in the tool's save-file shape so
                                       loadHidingZone sets it as the boundary).
  - denver-counties.geojson         -> reference for 1st-admin (counties use
                                       OSM Zone 6, so this is informational).
  - ../public/denver-municipalities.geojson -> bundled with the app and used by
                                       default for the "Same Named Zone" matching
                                       question (2nd-admin / municipalities).

Coordinates are rounded to COORD_PRECISION decimals (~1 m at 5) and written as
compact JSON to keep the municipality file small enough for localStorage/sharing;
that precision is far finer than needed for point-in-zone membership.

Usage:
  python3 convert_kml_to_geojson.py [SRC_DIR]
SRC_DIR defaults to this script's directory; it must contain:
  game_border_exact.kml, county_zones_colored.kml,
  second_admin_zones_filled_colored.kml
"""
import json
import os
import sys
import xml.etree.ElementTree as ET

KML_NS = "{http://www.opengis.net/kml/2.2}"
COORD_PRECISION = 5

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else HERE
OUT = HERE
# The municipality zones are bundled with the app (served + fetched at runtime),
# so they go in public/ rather than here.
PUBLIC = os.path.join(os.path.dirname(HERE), "public")


def parse_ring(text):
    ring = []
    for tok in text.split():
        parts = tok.split(",")
        ring.append(
            [round(float(parts[0]), COORD_PRECISION), round(float(parts[1]), COORD_PRECISION)]
        )
    if ring and ring[0] != ring[-1]:
        ring.append(ring[0])  # close the ring
    return ring


def polygon_coords(poly_el):
    outer = poly_el.find(
        f"{KML_NS}outerBoundaryIs/{KML_NS}LinearRing/{KML_NS}coordinates"
    )
    if outer is None or not (outer.text and outer.text.strip()):
        return None
    rings = [parse_ring(outer.text)]
    for inner in poly_el.findall(
        f"{KML_NS}innerBoundaryIs/{KML_NS}LinearRing/{KML_NS}coordinates"
    ):
        if inner.text and inner.text.strip():
            rings.append(parse_ring(inner.text))
    return rings


def placemark_geometry(pm):
    polys = [pc for poly in pm.iter(f"{KML_NS}Polygon") if (pc := polygon_coords(poly))]
    if not polys:
        return None
    if len(polys) == 1:
        return {"type": "Polygon", "coordinates": polys[0]}
    return {"type": "MultiPolygon", "coordinates": polys}


def feature_collection(path):
    root = ET.parse(path).getroot()
    features = []
    for pm in root.iter(f"{KML_NS}Placemark"):
        name_el = pm.find(f"{KML_NS}name")
        name = name_el.text.strip() if (name_el is not None and name_el.text) else None
        geom = placemark_geometry(pm)
        if geom is None:
            continue
        features.append(
            {"type": "Feature", "properties": {"name": name}, "geometry": geom}
        )
    return {"type": "FeatureCollection", "features": features}


def write(path, obj):
    with open(path, "w") as f:
        json.dump(obj, f, separators=(",", ":"))  # compact
    return os.path.getsize(path)


border_fc = feature_collection(os.path.join(SRC, "game_border_exact.kml"))
# The tool's loadHidingZone expects the boundary in its save-file shape (a
# FeatureCollection spread at the top level plus these fields). disabledStations
# must be present or the loader throws on an unguarded property access.
border_save = {
    **border_fc,
    "questions": [],
    "disabledStations": [],
    "hidingRadius": 0.5,
    "hidingRadiusUnits": "miles",
    "zoneOptions": ["[railway=station]"],
    "useCustomStations": False,
    "customStations": [],
    "includeDefaultStations": True,
    "presets": [],
    "permanentOverlay": None,
}

sizes = {
    "denver-border.hidingzone.json": write(
        os.path.join(OUT, "denver-border.hidingzone.json"), border_save
    ),
    "denver-counties.geojson": write(
        os.path.join(OUT, "denver-counties.geojson"),
        feature_collection(os.path.join(SRC, "county_zones_colored.kml")),
    ),
    "../public/denver-municipalities.geojson": write(
        os.path.join(PUBLIC, "denver-municipalities.geojson"),
        feature_collection(os.path.join(SRC, "second_admin_zones_filled_colored.kml")),
    ),
}

for name, size in sizes.items():
    print(f"{name}: {size:,} bytes")

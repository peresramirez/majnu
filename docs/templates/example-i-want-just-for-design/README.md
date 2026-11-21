# The Watcher's Map

An enchanted-parchment view of the live picoScan150 data: the same reader, static map,
segmentation and tracking as `../lidar/live_reader.py` (reused, not copied). Only the look differs.
Original design inspired by old hand-drawn maps.

## Run

Stop `lidar/live_reader.py` first (only one program can receive the sensor's data), then:

```
python3 parchment_map/serve.py
```

Open **http://localhost:8791**.

## What you see

- **The closed map:** whisper any words and press Enter, or break the red wax seal. The parchment
  unfolds and the ink spreads out from the watcher (the LiDAR).
- **Walls** in ink, drawn as a double line (wall thickness) with tiny lettering along them.
  **Objects** have hatching behind them and a Latin label `objectum xii` (only those over 25 cm).
- **People:** footprints walking across the map, left and right in turn, one per ~32 cm stride,
  fading after ~4.5 s. Someone standing still shows as a pair of feet gently fading in and out.
  Each person gets a **name ribbon** (unique name, own ink colour). Newcomers read "· newly arrived".
- **The nose gear**, when detected, is drawn with a red ribbon.
- **Orientation:** default checked by walking in our room: walking towards the camera moves you up
  on the map, walking right moves you right. The compass points up (the LiDAR's front, cables down).
  *Turn the map* rotates by 90° per click, *Mirror the map* swaps left and right; together they
  reach every orientation. The choice is remembered.
- **Name a person:** click their ribbon or footprints, type a name (e.g. PJ), press Enter. Named
  people get a larger ribbon. If the tracker loses them for a moment and finds them again within
  1.2 m, the name carries over.
  The filled point of the watcher's compass shows where the sensor is looking.
- Drag to move, scroll to zoom. *Return to the watcher* re-centres, *Forget the room* resets the
  static map, *Fold the map* closes it again.

Distances on the map are "paces" = metres.

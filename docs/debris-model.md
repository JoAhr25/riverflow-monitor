# Debris Detection Model Guide

The detector architecture (`backend/processing/debris_detector.py`) loads a
YOLO model via `ultralytics`, and a centroid tracker
(`processing/tracking.py`) counts **unique** floating objects (not
per-frame re-detections). Until a model is configured, the system honestly
reports "Model not configured" — it never fabricates detections.

## 1. Collect and label data

- Extract frames from your river videos (`ffmpeg -i river.mp4 -vf fps=1 frames/%04d.jpg`)
- Aim for at least 100–200 labeled frames to start; include empty water frames too
- Label floating objects (branches, plastic, bottles, leaves) with
  [Label Studio](https://labelstud.io/), Roboflow, or `labelimg`
- Export in **YOLO format** (one `.txt` per image)

## 2. Train

On any PC with a GPU (or Colab):

```python
from ultralytics import YOLO

model = YOLO("yolov8n.pt")  # nano is enough to start
model.train(data="debris.yaml", epochs=100, imgsz=640)
```

`debris.yaml` points at your train/val splits with classes like
`["branch", "plastic", "bottle", "leaf"]`.

## 3. Attach to the webapp

1. `pip install ultralytics` in the backend environment
2. Copy the trained weights (e.g. `best.pt`) onto the machine running the backend
3. Settings → Debris AI → set **model path** and confidence threshold, save

The backend loads the model, runs detection every `flow.frame_interval`
frames inside the processing loop, draws the rose debris brackets from real
detections, and the tracker reports unique-object counts.

## 4. Validate honestly

Use the **Testing & Validation** page to record reference counts vs.
measured counts for sample videos — error/accuracy is computed and stored,
ready for your thesis results chapter.

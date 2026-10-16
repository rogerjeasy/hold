/// <reference lib="webworker" />
import { measurePhoto, readyOpenCv } from '@hold/vision/measure'
import opencv from '@techstark/opencv-js'

// Measures photographs off the main thread (architecture.md section 9.1). OpenCV.js is large, so it loads here, once,
// when the handover screen opens, and the camera stays smooth while it does.
const ready = readyOpenCv(opencv)

type Request = { readonly id: number; readonly data: Uint8ClampedArray; readonly width: number; readonly height: number }

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, data, width, height } = event.data
  void ready.then(({ cv }) => {
    try {
      self.postMessage({ id, measures: measurePhoto(cv, { data, width, height }) })
    } catch {
      self.postMessage({ id, measures: undefined })
    }
  })
}

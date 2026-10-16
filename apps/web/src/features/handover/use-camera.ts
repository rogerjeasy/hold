'use client'

import { useEffect, useRef, useState } from 'react'

export type CameraState = 'starting' | 'live' | 'unavailable'

// The phone's rear camera at the highest resolution it allows (tech-stack.md section 3). Unavailable when the browser
// has none or the person says no; the screen then offers a file instead.
export function useCamera(on: boolean) {
  const video = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<CameraState>('starting')
  useEffect(() => {
    if (!on) return
    let stream: MediaStream | undefined
    let stopped = false
    const start = async () => {
      if (!('mediaDevices' in navigator) || !('getUserMedia' in navigator.mediaDevices)) {
        setState('unavailable')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 4032 }, height: { ideal: 3024 } } })
        if (stopped || video.current === null) return
        video.current.srcObject = stream
        await video.current.play()
        setState('live')
      } catch {
        if (!stopped) setState('unavailable')
      }
    }
    void start()
    return () => {
      stopped = true
      for (const track of stream?.getTracks() ?? []) track.stop()
    }
  }, [on])
  return { video, state }
}

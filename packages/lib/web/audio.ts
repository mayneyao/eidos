/**
 * Play a notification sound using Web Audio API
 * This provides a premium-feeling "done" chime for agent tasks.
 */
export async function playNotificationSound(volume = 0.5) {
  const AudioContextClass =
    window.AudioContext || (window as any).webkitAudioContext
  if (!AudioContextClass) {
    console.warn("AudioContext not supported in this browser")
    return
  }

  try {
    const audioContext = new AudioContextClass()

    const now = audioContext.currentTime

    // Helper to play a single chime note
    const playNote = (freq: number, startTime: number, duration: number) => {
      const osc = audioContext.createOscillator()
      const gain = audioContext.createGain()

      osc.type = "sine"
      osc.frequency.setValueAtTime(freq, startTime)

      gain.gain.setValueAtTime(0, startTime)
      gain.gain.linearRampToValueAtTime(volume, startTime + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)

      osc.connect(gain)
      gain.connect(audioContext.destination)

      osc.start(startTime)
      osc.stop(startTime + duration)
    }

    // A pleasant two-tone chime (A5 and C#6)
    playNote(880, now, 0.6) // A5
    playNote(1108.73, now + 0.08, 0.6) // C#6

    // Clean up
    setTimeout(() => {
      audioContext.close().catch(() => {})
    }, 1000)
  } catch (err) {
    console.error("Failed to play notification sound:", err)
  }
}
